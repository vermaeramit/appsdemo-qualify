// Integration test of the opening flow for form/API leads: real Postgres (RLS), fake WhatsApp.
import { randomBytes } from 'node:crypto';
import { travelPlaybookTemplate } from '@qualify/core';
import {
  eq,
  getDefaultPublishedPlaybook,
  leads,
  messages,
  playbookVersions,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import type { LlmClient, StructuredRequest } from '@qualify/integrations';
import type { AgentTurn } from '@qualify/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { createMemoryLock } from '../lock.ts';
import { ALLOWED, PHONE_NUMBER_ID, startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import { processContact, type ContactDeps } from './contact.ts';
import { processRespond } from './respond.ts';
import type { AgentMessagingClient } from './send.ts';

const masterKey = randomBytes(32);
let testDb: TestDb;
let client: Record<keyof AgentMessagingClient, ReturnType<typeof vi.fn>>;
const lock = createMemoryLock();

function deps(overrides: Partial<ContactDeps> = {}): ContactDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    masterKey,
    createClient: () => client as unknown as AgentMessagingClient,
    allowlist: [ALLOWED, '919800000011', '919800000012', '919800000013', '919800000014'],
    isProduction: false,
    lock,
    ...overrides,
  };
}

async function createApiLead(
  phone: string,
  options: { name?: string; fields?: Record<string, string>; lastInboundAt?: Date } = {},
): Promise<string> {
  const [lead] = await withTenant(testDb.app.db, TENANT, (tx) =>
    tx
      .insert(leads)
      .values({
        tenantId: TENANT,
        phoneE164: `+${phone}`,
        name: options.name ?? 'Rahul Sharma',
        source: 'api',
        fields: options.fields ?? {},
        lastInboundAt: options.lastInboundAt ?? null,
      })
      .returning({ id: leads.id }),
  );
  return lead!.id;
}

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
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  const ok = () => vi.fn(async () => ({ messageId: `wamid.out.${Math.random()}` }));
  client = {
    sendText: ok(),
    sendButtons: ok(),
    sendList: ok(),
    sendTemplate: ok(),
    markRead: vi.fn(async () => undefined),
  };
});

describe('processContact (opening message)', () => {
  it('records a failed opening when no template is approved and the window is closed', async () => {
    const leadId = await createApiLead(ALLOWED);
    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe('no_template');
    expect(client.sendTemplate).not.toHaveBeenCalled();
    const [opening] = await leadMessages(leadId);
    expect(opening).toMatchObject({ type: 'template', status: 'failed', sender: 'system' });
    expect((await getLead(leadId)).status).toBe('new');
  });

  it('sends the approved template with name and business as parameters', async () => {
    // Approve a template: publish v2 of the default playbook with the template name set.
    await withTenant(testDb.app.db, TENANT, async (tx) => {
      const current = await getDefaultPublishedPlaybook(tx);
      const config = travelPlaybookTemplate('Sunrise Holidays');
      await publishPlaybookVersion(tx, {
        tenantId: TENANT,
        playbookId: current!.playbookId,
        config: { ...config, opening: { ...config.opening!, templateName: 'qualify_opening_v1' } },
      });
    });
    const leadId = await createApiLead('919800000011', { fields: { destination: 'Dubai' } });

    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe('sent_template');
    expect(client.sendTemplate).toHaveBeenCalledWith({
      phoneNumberId: PHONE_NUMBER_ID,
      to: '919800000011',
      templateName: 'qualify_opening_v1',
      language: 'en',
      bodyParams: ['Rahul', 'Sunrise Holidays'],
    });
    const [opening] = await leadMessages(leadId);
    expect(opening).toMatchObject({ type: 'template', status: 'sent' });
    expect(opening!.body).toContain('Hi Rahul! 👋 Thanks for your enquiry with Sunrise Holidays.');
    const lead = await getLead(leadId);
    expect(lead.status).toBe('contacting');
    expect(lead.playbookVersionId).not.toBeNull();
  });

  it('uses the current playbook for a repeat enquiry from a lead pinned to an older version', async () => {
    const [first] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx
        .select({ id: playbookVersions.id })
        .from(playbookVersions)
        .where(eq(playbookVersions.versionNo, 1)),
    );
    const leadId = await createApiLead('919800000014');
    await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.update(leads).set({ playbookVersionId: first!.id }).where(eq(leads.id, leadId)),
    );

    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe('sent_template');
    const current = await withTenant(testDb.app.db, TENANT, (tx) =>
      getDefaultPublishedPlaybook(tx),
    );
    expect((await getLead(leadId)).playbookVersionId).toBe(current!.versionId);
  });

  it('sends a free-form opening with buttons when the lead wrote in the last 24 h', async () => {
    const leadId = await createApiLead('919800000012', { lastInboundAt: new Date() });
    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe('sent_freeform');
    expect(client.sendTemplate).not.toHaveBeenCalled();
    expect(client.sendButtons).toHaveBeenCalledWith(
      expect.objectContaining({ buttons: ['Yes, sure', 'Not now'] }),
    );
  });

  it('does not send a second opening for a repeated submission within 10 minutes', async () => {
    const leadId = await createApiLead('919800000013');
    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe('sent_template');
    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe(
      'skipped_recent_opening',
    );
    expect(client.sendTemplate).toHaveBeenCalledOnce();
  });

  it('respects the dev allowlist', async () => {
    const leadId = await createApiLead('919811111111');
    expect(await processContact({ tenantId: TENANT, leadId }, deps())).toBe('skipped_not_allowed');
  });

  it('continues with the AI when the lead answers the opening, without re-asking form answers', async () => {
    const leadId = (
      await withTenant(testDb.app.db, TENANT, (tx) =>
        tx.select({ id: leads.id }).from(leads).where(eq(leads.phoneE164, '+919800000011')),
      )
    )[0]!.id;
    await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.insert(messages).values({
        tenantId: TENANT,
        leadId,
        phoneNumberId: PHONE_NUMBER_ID,
        direction: 'inbound',
        sender: 'lead',
        type: 'button',
        body: 'Yes, sure',
        waMessageId: 'wamid.reply.1',
        status: 'received',
      }),
    );
    await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.update(leads).set({ lastInboundAt: new Date() }).where(eq(leads.id, leadId)),
    );

    const requests: StructuredRequest<z.ZodType>[] = [];
    const turn: AgentTurn = {
      language: 'en',
      reply: 'Great! When are you planning to travel?',
      quickReplies: ['This month', 'Next month'],
      askingField: 'travel_month',
      extracted: [],
      signals: { urgency: 5, seriousness: 6, buyingSignals: 3, note: 'Dubai enquiry' },
      handoff: { requested: false, reason: null },
      disqualified: { value: false, reason: null },
    };
    const llm: LlmClient = {
      async generateStructured(request) {
        requests.push(request as StructuredRequest<z.ZodType>);
        return {
          output: turn as never,
          usage: {
            model: 'fake',
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            reasoningTokens: 0,
            latencyMs: 1,
          },
        };
      },
      async generateText() {
        throw new Error('not used');
      },
    };

    const outcome = await processRespond(
      { tenantId: TENANT, leadId },
      {
        db: testDb.app.db,
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        llm,
        model: 'fake',
        reasoningEffort: 'low',
        masterKey,
        createClient: () => client as unknown as AgentMessagingClient,
        allowlist: ['919800000011'],
        isProduction: false,
        lock,
        enqueueRespond: vi.fn(async () => undefined),
      },
    );

    expect(outcome).toBe('replied');
    expect(requests[0]!.messages[0]).toMatchObject({ role: 'assistant' }); // the opening is context
    expect(requests[0]!.messages.at(-1)).toEqual({ role: 'user', content: 'Yes, sure' });
    expect(requests[0]!.stateNote).toContain('Collected fields: destination=Dubai'); // form answer
    expect(client.sendButtons).toHaveBeenCalledWith(
      expect.objectContaining({ buttons: ['This month', 'Next month'] }),
    );
    expect((await getLead(leadId)).status).toBe('engaged');
  });
});
