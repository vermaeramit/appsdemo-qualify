// Integration test of the AI respond engine: real Postgres (RLS), fake LLM, fake WhatsApp.
import { randomBytes } from 'node:crypto';
import { eq, leads, messages, withTenant } from '@qualify/db';
import type { LlmClient, StructuredRequest } from '@qualify/integrations';
import type { AgentTurn, RespondJob } from '@qualify/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import { createMemoryLock } from '../lock.ts';
import { ALLOWED, PHONE_NUMBER_ID, startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import {
  type AgentMessagingClient,
  LeadBusyError,
  processRespond,
  type RespondDeps,
} from './respond.ts';

const masterKey = randomBytes(32);
let testDb: TestDb;
let requests: StructuredRequest<z.ZodType>[];
let nextTurn: AgentTurn;
let onGenerate: (() => Promise<void>) | undefined;
let client: {
  sendText: ReturnType<typeof vi.fn>;
  sendButtons: ReturnType<typeof vi.fn>;
  markRead: ReturnType<typeof vi.fn>;
};
let enqueueRespond: ReturnType<typeof vi.fn<(job: RespondJob, delayMs: number) => Promise<void>>>;
const lock = createMemoryLock();

function turn(overrides: Partial<AgentTurn> = {}): AgentTurn {
  return {
    language: 'hinglish',
    reply: 'Wah, Dubai! Kab ka plan hai?',
    quickReplies: [],
    extracted: [],
    signals: { urgency: 5, seriousness: 5, buyingSignals: 5, note: 'ok' },
    handoff: { requested: false, reason: null },
    disqualified: { value: false, reason: null },
    ...overrides,
  };
}

const fakeLlm: LlmClient = {
  async generateStructured(request) {
    requests.push(request as StructuredRequest<z.ZodType>);
    await onGenerate?.();
    return {
      output: nextTurn as never,
      usage: {
        model: 'fake-model',
        inputTokens: 2000,
        cachedInputTokens: 1500,
        outputTokens: 120,
        reasoningTokens: 40,
        latencyMs: 900,
      },
    };
  },
  async generateText() {
    throw new Error('not used');
  },
};

function deps(overrides: Partial<RespondDeps> = {}): RespondDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    llm: fakeLlm,
    model: 'fake-model',
    reasoningEffort: 'low',
    masterKey,
    createClient: () => client as unknown as AgentMessagingClient,
    allowlist: [ALLOWED, '919800000002', '919800000003', '919800000004', '919800000005'],
    isProduction: false,
    lock,
    enqueueRespond,
    now: () => new Date(),
    ...overrides,
  };
}

let counter = 0;
async function addInbound(leadId: string, body: string): Promise<void> {
  counter += 1;
  await withTenant(testDb.app.db, TENANT, (tx) =>
    tx.insert(messages).values({
      tenantId: TENANT,
      leadId,
      phoneNumberId: PHONE_NUMBER_ID,
      direction: 'inbound',
      sender: 'lead',
      type: 'text',
      body,
      waMessageId: `wamid.in.${counter}`,
      status: 'received',
    }),
  );
}

async function createLead(
  phone: string,
  firstMessage: string,
  lastInboundAt = new Date(),
): Promise<string> {
  const [lead] = await withTenant(testDb.app.db, TENANT, (tx) =>
    tx
      .insert(leads)
      .values({
        tenantId: TENANT,
        phoneE164: `+${phone}`,
        name: 'Rahul',
        source: 'whatsapp_inbound',
        lastInboundAt,
      })
      .returning({ id: leads.id }),
  );
  await addInbound(lead!.id, firstMessage);
  return lead!.id;
}

const getLead = async (id: string) =>
  (
    await withTenant(testDb.app.db, TENANT, (tx) => tx.select().from(leads).where(eq(leads.id, id)))
  )[0]!;
const getOutbound = (leadId: string) =>
  withTenant(testDb.app.db, TENANT, (tx) =>
    tx.select().from(messages).where(eq(messages.leadId, leadId)),
  ).then((rows) => rows.filter((row) => row.direction === 'outbound'));

beforeAll(async () => {
  testDb = await startTestDb(masterKey);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  requests = [];
  onGenerate = undefined;
  nextTurn = turn();
  enqueueRespond = vi.fn(async () => undefined);
  client = {
    sendText: vi.fn(async () => ({ messageId: `wamid.out.${Math.random()}` })),
    sendButtons: vi.fn(async () => ({ messageId: `wamid.out.${Math.random()}` })),
    markRead: vi.fn(async () => undefined),
  };
});

describe('processRespond', () => {
  let leadId: string;

  it('answers the first message with buttons, merges fields and pins the playbook', async () => {
    leadId = await createLead(ALLOWED, 'Hi, Dubai trip, wife ke saath');
    nextTurn = turn({
      quickReplies: ['Is mahine', 'Next month', 'In 2-3 months, maybe', 'Fourth'],
      extracted: [
        { key: 'destination', value: 'Dubai' },
        { key: 'travelers', value: '2 adults' },
        { key: 'shoe_size', value: '9' },
      ],
      signals: { urgency: 7.6, seriousness: 12, buyingSignals: -1, note: 'Couple, Dubai' },
    });

    const outcome = await processRespond({ tenantId: TENANT, leadId }, deps());

    expect(outcome).toBe('replied');
    expect(requests).toHaveLength(1);
    expect(requests[0]!.system).toContain('You are Riya, travel advisor at Sunrise Holidays');
    expect(requests[0]!.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Hi, Dubai trip, wife ke saath',
    });
    expect(requests[0]!.stateNote).toContain(
      'Missing required fields (ask in this order): destination',
    );
    expect(requests[0]!.cacheKey).toBe(`playbook:${testDb.playbookVersionId}`);
    expect(client.markRead).toHaveBeenCalledWith(PHONE_NUMBER_ID, expect.any(String), {
      typing: true,
    });
    expect(client.sendButtons).toHaveBeenCalledWith({
      phoneNumberId: PHONE_NUMBER_ID,
      to: ALLOWED,
      body: 'Wah, Dubai! Kab ka plan hai?',
      buttons: ['Is mahine', 'Next month', 'In 2-3 months, maybe'],
    });

    const lead = await getLead(leadId);
    expect(lead).toMatchObject({
      status: 'engaged',
      language: 'hinglish',
      playbookVersionId: testDb.playbookVersionId,
      fields: { destination: 'Dubai', travelers: '2 adults' },
      signals: { urgency: 8, seriousness: 10, buyingSignals: 0, note: 'Couple, Dubai' },
    });
    const [outbound] = await getOutbound(leadId);
    expect(outbound).toMatchObject({ sender: 'ai', type: 'interactive', status: 'sent' });
    expect(
      (outbound!.payload as { rejected: { key: string }[] }).rejected.map((r) => r.key),
    ).toEqual(['shoe_size']);
  });

  it('does nothing when there is no new message from the lead', async () => {
    expect(await processRespond({ tenantId: TENANT, leadId }, deps())).toBe('skipped_nothing_new');
    expect(requests).toHaveLength(0);
  });

  it('marks the lead qualified when all required fields are collected, without buttons', async () => {
    await addInbound(leadId, 'Dec me, Delhi se, budget 70k total');
    nextTurn = turn({
      reply: 'Thank you! Our expert will call you shortly 😊',
      quickReplies: ['Ok'],
      extracted: [
        { key: 'travel_month', value: '2026-12' },
        { key: 'departure_city', value: 'Delhi' },
        { key: 'budget', value: '70000 INR total' },
      ],
    });

    expect(await processRespond({ tenantId: TENANT, leadId }, deps())).toBe('replied');
    expect(client.sendText).toHaveBeenCalledOnce();
    expect(client.sendButtons).not.toHaveBeenCalled();
    const lead = await getLead(leadId);
    expect(lead.status).toBe('qualified');
    expect(lead.qualifiedAt).not.toBeNull();
  });

  it('hands off to a human and then stays silent', async () => {
    const id = await createLead('919800000002', 'Please call me');
    nextTurn = turn({
      reply: 'Sure! Our travel expert will call you shortly 😊',
      handoff: { requested: true, reason: 'asked for call' },
    });

    expect(await processRespond({ tenantId: TENANT, leadId: id }, deps())).toBe('replied');
    expect(await getLead(id)).toMatchObject({ status: 'handoff', aiPaused: true });

    await addInbound(id, 'Hello?');
    expect(await processRespond({ tenantId: TENANT, leadId: id }, deps())).toBe('skipped_paused');
  });

  it('does not send a stale reply when the lead wrote again while the model was thinking', async () => {
    const id = await createLead('919800000003', 'Goa trip');
    onGenerate = () => addInbound(id, 'Actually make it Kerala');

    expect(await processRespond({ tenantId: TENANT, leadId: id }, deps())).toBe('superseded');
    expect(client.sendText).not.toHaveBeenCalled();
    expect(client.sendButtons).not.toHaveBeenCalled();
    expect(enqueueRespond).toHaveBeenCalledWith({ tenantId: TENANT, leadId: id }, 1_000);
  });

  it('refuses to run in parallel for the same lead', async () => {
    const id = await createLead('919800000004', 'Hi');
    await lock.withLock(`respond-lock:${id}`, async () => {
      await expect(processRespond({ tenantId: TENANT, leadId: id }, deps())).rejects.toBeInstanceOf(
        LeadBusyError,
      );
    });
  });

  it('respects the 24 h window and the dev allowlist', async () => {
    const old = await createLead(
      '919800000005',
      'Hi',
      new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    );
    expect(await processRespond({ tenantId: TENANT, leadId: old }, deps())).toBe(
      'skipped_window_closed',
    );

    const stranger = await createLead('919811111111', 'Hi');
    expect(await processRespond({ tenantId: TENANT, leadId: stranger }, deps())).toBe(
      'skipped_not_allowed',
    );
    expect(requests).toHaveLength(0);
  });

  it('records a failed send but keeps what the lead told us', async () => {
    const id = await createLead('919800000002'.replace('2', '6'), 'Bali trip');
    client.sendText = vi.fn(async () => {
      throw new Error('network down');
    });
    nextTurn = turn({ extracted: [{ key: 'destination', value: 'Bali' }] });

    expect(
      await processRespond(
        { tenantId: TENANT, leadId: id },
        deps({ allowlist: [], isProduction: true }),
      ),
    ).toBe('send_failed');
    const [outbound] = await getOutbound(id);
    expect(outbound).toMatchObject({ status: 'failed', error: { message: 'network down' } });
    expect((await getLead(id)).fields).toEqual({ destination: 'Bali' });
  });

  it('stays silent when no AI provider is configured', async () => {
    const id = await createLead('919800000007', 'Hi');
    expect(await processRespond({ tenantId: TENANT, leadId: id }, deps({ llm: null }))).toBe(
      'skipped_no_ai',
    );
  });
});
