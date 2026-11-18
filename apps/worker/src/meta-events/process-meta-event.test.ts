// Integration test: webhook event → lead + message → debounced respond job.
import { randomBytes } from 'node:crypto';
import { eq, inboundMetaEvents, leads, messages, withTenant } from '@qualify/db';
import type { RespondJob } from '@qualify/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALLOWED,
  PHONE_NUMBER_ID,
  STRANGER,
  startTestDb,
  TENANT,
  type TestDb,
} from '../test/test-db.ts';
import { processMetaEvent, type ProcessorDeps } from './process-meta-event.ts';

let testDb: TestDb;
let enqueueRespond: ReturnType<typeof vi.fn<(job: RespondJob) => Promise<void>>>;

function deps(): ProcessorDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    allowlist: [ALLOWED],
    isProduction: false,
    enqueueRespond,
  };
}

function inboundPayload(
  from: string,
  waMessageId: string,
  text: string,
  phoneNumberId = PHONE_NUMBER_ID,
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DEV',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '919350983656', phone_number_id: phoneNumberId },
              contacts: [{ wa_id: from, profile: { name: 'Rahul Sharma' } }],
              messages: [
                {
                  id: waMessageId,
                  from,
                  timestamp: '1763400000',
                  type: 'text',
                  text: { body: text },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(
  waMessageId: string,
  status: string,
  timestamp: string,
  pricing?: Record<string, unknown>,
) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DEV',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { display_phone_number: '919350983656', phone_number_id: PHONE_NUMBER_ID },
              statuses: [
                {
                  id: waMessageId,
                  status,
                  timestamp,
                  recipient_id: ALLOWED,
                  ...(pricing ? { pricing } : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function storeEvent(payload: Record<string, unknown>): Promise<string> {
  const [event] = await testDb.app.db
    .insert(inboundMetaEvents)
    .values({ object: 'whatsapp_business_account', payload })
    .returning({ id: inboundMetaEvents.id });
  return event!.id;
}

const tenantMessages = () => withTenant(testDb.app.db, TENANT, (tx) => tx.select().from(messages));

beforeAll(async () => {
  testDb = await startTestDb(randomBytes(32));
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  enqueueRespond = vi.fn(async () => undefined);
});

describe('processMetaEvent', () => {
  it('stores the lead and message and schedules one AI reply', async () => {
    const eventId = await storeEvent(inboundPayload(ALLOWED, 'wamid.in.1', 'Dubai package price?'));
    await processMetaEvent(eventId, deps());

    const [lead] = await withTenant(testDb.app.db, TENANT, (tx) => tx.select().from(leads));
    expect(lead).toMatchObject({
      phoneE164: `+${ALLOWED}`,
      name: 'Rahul Sharma',
      source: 'whatsapp_inbound',
    });
    expect(lead?.lastInboundAt).toEqual(new Date(1763400000 * 1000));

    const stored = await tenantMessages();
    expect(stored.find((row) => row.waMessageId === 'wamid.in.1')).toMatchObject({
      direction: 'inbound',
      sender: 'lead',
      body: 'Dubai package price?',
    });
    expect(enqueueRespond).toHaveBeenCalledExactlyOnceWith({ tenantId: TENANT, leadId: lead!.id });

    const [event] = await testDb.app.db
      .select()
      .from(inboundMetaEvents)
      .where(eq(inboundMetaEvents.id, eventId));
    expect(event?.processedAt).not.toBeNull();
  });

  it('does not schedule again when the same event or a Meta retry is processed', async () => {
    const before = (await tenantMessages()).length;
    const firstEventId = (await testDb.app.db.select().from(inboundMetaEvents).limit(1))[0]!.id;
    await processMetaEvent(firstEventId, deps());
    await processMetaEvent(
      await storeEvent(inboundPayload(ALLOWED, 'wamid.in.1', 'Dubai package price?')),
      deps(),
    );

    expect(enqueueRespond).not.toHaveBeenCalled();
    expect((await tenantMessages()).length).toBe(before);
  });

  it('stores but does not schedule replies for numbers outside DEV_ALLOWED_NUMBERS', async () => {
    await processMetaEvent(
      await storeEvent(inboundPayload(STRANGER, 'wamid.in.2', 'hello')),
      deps(),
    );
    expect(enqueueRespond).not.toHaveBeenCalled();
    expect((await tenantMessages()).some((row) => row.waMessageId === 'wamid.in.2')).toBe(true);
  });

  it('applies delivery statuses in order and ignores late, older statuses', async () => {
    const [lead] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(leads).limit(1),
    );
    await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.insert(messages).values({
        tenantId: TENANT,
        leadId: lead!.id,
        phoneNumberId: PHONE_NUMBER_ID,
        direction: 'outbound',
        sender: 'ai',
        type: 'text',
        body: 'Hi!',
        waMessageId: 'wamid.out.1',
        status: 'sent',
      }),
    );
    for (const [status, ts] of [
      ['delivered', '1763400010'],
      ['read', '1763400020'],
      ['sent', '1763400005'],
    ] as const) {
      await processMetaEvent(await storeEvent(statusPayload('wamid.out.1', status, ts)), deps());
    }
    const [updated] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(messages).where(eq(messages.waMessageId, 'wamid.out.1')),
    );
    expect(updated?.status).toBe('read');
    expect(updated?.pricing).toBeNull();
  });

  it('stores Meta pricing from a status, even one that arrives late', async () => {
    const pricing = {
      billable: true,
      category: 'marketing',
      type: 'regular',
      pricing_model: 'PMP',
    };
    await processMetaEvent(
      await storeEvent(statusPayload('wamid.out.1', 'delivered', '1763400011', pricing)),
      deps(),
    );
    const [updated] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(messages).where(eq(messages.waMessageId, 'wamid.out.1')),
    );
    expect(updated?.status).toBe('read');
    expect(updated?.pricing).toEqual({ billable: true, category: 'marketing', type: 'regular' });
  });

  it('ignores emoji reactions completely', async () => {
    const before = (await tenantMessages()).length;
    const payload = inboundPayload(ALLOWED, 'wamid.reaction.1', 'unused');
    const value = payload.entry[0]!.changes[0]!.value as { messages: Record<string, unknown>[] };
    value.messages = [
      {
        id: 'wamid.reaction.1',
        from: ALLOWED,
        timestamp: '1763400100',
        type: 'reaction',
        reaction: { message_id: 'wamid.out.1', emoji: '👍' },
      },
    ];
    await processMetaEvent(await storeEvent(payload), deps());
    expect((await tenantMessages()).length).toBe(before);
    expect(enqueueRespond).not.toHaveBeenCalled();
  });

  it('ignores webhooks for phone numbers that belong to no tenant', async () => {
    const before = (await tenantMessages()).length;
    await processMetaEvent(
      await storeEvent(inboundPayload(ALLOWED, 'wamid.in.4', 'hi', 'PN_UNKNOWN')),
      deps(),
    );
    expect((await tenantMessages()).length).toBe(before);
    expect(enqueueRespond).not.toHaveBeenCalled();
  });
});
