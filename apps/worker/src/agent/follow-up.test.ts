// Integration test of follow-ups: real Postgres (RLS), fake WhatsApp, fake LLM, in-memory scheduler.
import { randomBytes } from 'node:crypto';
import { travelPlaybookTemplate } from '@qualify/core';
import {
  eq,
  getDefaultPublishedPlaybook,
  leads,
  messages,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import type { LlmClient, StructuredRequest } from '@qualify/integrations';
import type { AgentTurn, FollowUpJob } from '@qualify/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { createMemoryLock } from '../lock.ts';
import { ALLOWED, PHONE_NUMBER_ID, startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import { processContact } from './contact.ts';
import { type FollowUpDeps, type FollowUpScheduler, processFollowUp } from './follow-up.ts';
import type { AgentMessagingClient } from './send.ts';

const masterKey = randomBytes(32);
const lock = createMemoryLock();
const PHONES = ['919800000021', '919800000022', '919800000023', '919800000024', '919800000025'];
let testDb: TestDb;
let client: Record<keyof AgentMessagingClient, ReturnType<typeof vi.fn>>;
let scheduled: { job: FollowUpJob; dueAt: Date }[];
let cancelled: string[];
let requests: StructuredRequest<z.ZodType>[];
let nextTurn: AgentTurn;

const scheduler: FollowUpScheduler = {
  async schedule(job, dueAt) {
    scheduled.push({ job, dueAt });
  },
  async cancel(leadId) {
    cancelled.push(leadId);
  },
};

const fakeLlm: LlmClient = {
  async generateStructured(request) {
    requests.push(request as StructuredRequest<z.ZodType>);
    return {
      output: nextTurn as never,
      usage: {
        model: 'fake-model',
        inputTokens: 1000,
        cachedInputTokens: 800,
        outputTokens: 60,
        reasoningTokens: 0,
        latencyMs: 500,
      },
    };
  },
  async generateText() {
    return {
      text: 'Wants a Dubai trip in December with family; budget fits; ready to book.',
      usage: {
        model: 'fake-model',
        inputTokens: 600,
        cachedInputTokens: 0,
        outputTokens: 40,
        reasoningTokens: 0,
        latencyMs: 300,
      },
    };
  },
};

function deps(overrides: Partial<FollowUpDeps> = {}): FollowUpDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    llm: fakeLlm,
    model: 'fake-model',
    reasoningEffort: 'low',
    masterKey,
    createClient: () => client as unknown as AgentMessagingClient,
    allowlist: [ALLOWED, ...PHONES],
    isProduction: false,
    lock,
    scheduler,
    ...overrides,
  };
}

async function createLead(
  phone: string,
  values: { status: string; lastInboundAt?: Date; playbookVersionId?: string },
): Promise<string> {
  const [lead] = await withTenant(testDb.app.db, TENANT, (tx) =>
    tx
      .insert(leads)
      .values({
        tenantId: TENANT,
        phoneE164: `+${phone}`,
        name: 'Rahul Sharma',
        source: 'meta_form',
        status: values.status,
        lastInboundAt: values.lastInboundAt ?? null,
        playbookVersionId: values.playbookVersionId ?? null,
      })
      .returning({ id: leads.id }),
  );
  return lead!.id;
}

async function addMessage(
  leadId: string,
  direction: 'inbound' | 'outbound',
  body: string,
  payload: Record<string, unknown> = {},
): Promise<string> {
  const [row] = await withTenant(testDb.app.db, TENANT, (tx) =>
    tx
      .insert(messages)
      .values({
        tenantId: TENANT,
        leadId,
        phoneNumberId: PHONE_NUMBER_ID,
        direction,
        sender: direction === 'inbound' ? 'lead' : 'ai',
        type: 'text',
        body,
        payload,
        status: direction === 'inbound' ? 'received' : 'sent',
      })
      .returning({ id: messages.id }),
  );
  return row!.id;
}

const job = (leadId: string, afterMessageId: string, step = 0): FollowUpJob => ({
  tenantId: TENANT,
  leadId,
  kind: 'followup',
  step,
  afterMessageId,
});

const leadMessages = (leadId: string) =>
  withTenant(testDb.app.db, TENANT, (tx) =>
    tx.select().from(messages).where(eq(messages.leadId, leadId)),
  );
const getLead = async (leadId: string) =>
  (
    await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(leads).where(eq(leads.id, leadId)),
    )
  )[0]!;

beforeAll(async () => {
  testDb = await startTestDb(masterKey);
  // v2: approved opening and follow-up templates.
  await withTenant(testDb.app.db, TENANT, async (tx) => {
    const current = await getDefaultPublishedPlaybook(tx);
    const config = travelPlaybookTemplate('Sunrise Holidays');
    await publishPlaybookVersion(tx, {
      tenantId: TENANT,
      playbookId: current!.playbookId,
      config: {
        ...config,
        opening: { ...config.opening!, templateName: 'qualify_opening_test' },
        followUps: {
          ...config.followUps!,
          template: { ...config.followUps!.template, templateName: 'qualify_followup_test' },
        },
      },
    });
  });
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  scheduled = [];
  cancelled = [];
  requests = [];
  const ok = () => vi.fn(async () => ({ messageId: `wamid.out.${Math.random()}` }));
  client = {
    sendText: ok(),
    sendButtons: ok(),
    sendList: ok(),
    sendTemplate: ok(),
    markRead: vi.fn(async () => undefined),
    uploadMedia: vi.fn(async () => 'wa-media-1'),
    sendMedia: ok(),
  };
});

describe('follow-ups', () => {
  it('start after a delivered opening, 3 hours later (outside quiet hours)', async () => {
    const leadId = await createLead(PHONES[0]!, { status: 'new' });
    expect(
      await processContact(
        { tenantId: TENANT, leadId },
        {
          db: testDb.app.db,
          logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
          masterKey,
          createClient: () => client as unknown as AgentMessagingClient,
          allowlist: PHONES,
          isProduction: false,
          lock,
          followUps: scheduler,
        },
      ),
    ).toBe('sent_template');
    const [opening] = await leadMessages(leadId);
    expect(cancelled).toEqual([leadId]);
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.job).toMatchObject({
      kind: 'followup',
      step: 0,
      afterMessageId: opening!.id,
    });
    expect(scheduled[0]!.dueAt.getTime()).toBeGreaterThanOrEqual(
      opening!.createdAt.getTime() + 3 * 3_600_000,
    );
  });

  it('send the approved template outside the 24 h window, then schedule the next one', async () => {
    const leadId = await createLead(PHONES[1]!, { status: 'contacting' });
    const openingId = await addMessage(leadId, 'outbound', 'Hi Rahul!', { kind: 'opening' });

    expect(await processFollowUp(job(leadId, openingId), deps())).toBe('sent_template');
    expect(client.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        templateName: 'qualify_followup_test',
        to: PHONES[1],
        bodyParams: ['Rahul'],
      }),
    );
    const followUp = (await leadMessages(leadId)).find((m) => m.id !== openingId)!;
    expect(followUp).toMatchObject({ sender: 'system', type: 'template', status: 'sent' });
    expect(followUp.payload).toMatchObject({ kind: 'followup', step: 0, mode: 'template' });
    expect(scheduled.map((entry) => entry.job)).toEqual([
      expect.objectContaining({ kind: 'followup', step: 1, afterMessageId: followUp.id }),
    ]);
  });

  it('are stale once the lead has replied', async () => {
    const leadId = await createLead(PHONES[2]!, { status: 'contacting' });
    const openingId = await addMessage(leadId, 'outbound', 'Hi Rahul!', { kind: 'opening' });
    await addMessage(leadId, 'inbound', 'Yes, sure');

    expect(await processFollowUp(job(leadId, openingId), deps())).toBe('stale');
    expect(client.sendTemplate).not.toHaveBeenCalled();
    expect(scheduled).toEqual([]);
  });

  it('are written by the AI inside the window, with the pending question’s options', async () => {
    const leadId = await createLead(PHONES[3]!, {
      status: 'engaged',
      lastInboundAt: new Date(Date.now() - 2 * 3_600_000),
    });
    await addMessage(leadId, 'inbound', 'Dubai jaana hai');
    const askId = await addMessage(leadId, 'outbound', 'Kis type ka trip hai?', {
      askingField: 'trip_type',
    });
    nextTurn = {
      language: 'hinglish',
      reply: 'Bas check kar rahi thi 😊 Trip kis type ka hai?',
      quickReplies: [],
      askingField: 'trip_type',
      extracted: [],
      confirming: [],
      confirmed: [],
      signals: { urgency: 5, seriousness: 5, buyingSignals: 5, note: '' },
      handoff: { requested: false, reason: null },
      disqualified: { value: false, reason: null },
    };

    expect(await processFollowUp(job(leadId, askId), deps())).toBe('sent_freeform');
    expect(requests[0]!.stateNote).toContain('has not replied for about');
    // Five trip types → a list menu.
    expect(client.sendList).toHaveBeenCalledWith(
      expect.objectContaining({ rows: ['Honeymoon', 'Family', 'Friends', 'Solo', 'Group'] }),
    );
    const nudge = (await leadMessages(leadId)).at(-1)!;
    expect(nudge).toMatchObject({ sender: 'ai', body: nextTurn.reply });
    expect(nudge.payload).toMatchObject({ kind: 'followup', mode: 'freeform' });
  });

  it('mark the lead as not replying at the final check', async () => {
    const leadId = await createLead(PHONES[4]!, { status: 'contacting' });
    const lastId = await addMessage(leadId, 'outbound', 'Just checking in', { kind: 'followup' });

    expect(await processFollowUp({ ...job(leadId, lastId, 2), kind: 'unresponsive' }, deps())).toBe(
      'marked_unresponsive',
    );
    const lead = await getLead(leadId);
    expect(lead.status).toBe('unresponsive');
    expect(lead.scoreDetails).toMatchObject({ final: true });
    expect(lead.grade).toBe('cold');
    // The lead never wrote: no summary.
    expect(lead.summary).toBeNull();
  });

  it('explain a missing template and go straight to the final check', async () => {
    // Pinned to v1: the travel template without an approved follow-up template.
    const leadId = await createLead('919800000026', {
      status: 'contacting',
      playbookVersionId: testDb.playbookVersionId,
    });
    const openingId = await addMessage(leadId, 'outbound', 'Hi Rahul!', { kind: 'opening' });

    expect(
      await processFollowUp(job(leadId, openingId), deps({ allowlist: ['919800000026'] })),
    ).toBe('no_template');
    const attempt = (await leadMessages(leadId)).find((m) => m.id !== openingId)!;
    expect(attempt.status).toBe('failed');
    expect(attempt.error).toMatchObject({ message: expect.stringContaining('follow-up template') });
    expect(scheduled.map((entry) => entry.job.kind)).toEqual(['unresponsive']);
  });

  it('do nothing for qualified or paused leads', async () => {
    const leadId = await createLead('919800000027', { status: 'qualified' });
    const lastId = await addMessage(leadId, 'outbound', 'Thanks!');
    expect(await processFollowUp(job(leadId, lastId), deps())).toBe('skipped_closed');
    expect(client.sendTemplate).not.toHaveBeenCalled();
  });
});
