// Integration test: real Postgres (Testcontainers) + migrations, connected as qualify_app,
// with a fake WhatsApp client. Covers the webhook → lead/message → reply pipeline.
import { randomBytes } from 'node:crypto';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import {
  createDb,
  type DbHandle,
  eq,
  inboundMetaEvents,
  leads,
  messages,
  organization,
  phoneNumbers,
  runMigrations,
  tenants,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import { encryptSecret, MetaApiError } from '@qualify/integrations';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type MessagingClient,
  processMetaEvent,
  type ProcessorDeps,
} from './process-meta-event.ts';

const TENANT = 'org_travel';
const PHONE_NUMBER_ID = 'PN_DEV';
const ALLOWED = '919812345678';
const STRANGER = '919800000099';
const masterKey = randomBytes(32);

let container: StartedPostgreSqlContainer;
let app: DbHandle;
let sendText: ReturnType<typeof vi.fn>;
let tokensSeen: string[];

function deps(overrides: Partial<ProcessorDeps> = {}): ProcessorDeps {
  return {
    db: app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    allowlist: [ALLOWED],
    isProduction: false,
    masterKey,
    createClient: (token) => {
      tokensSeen.push(token);
      const client: MessagingClient = {
        sendText: sendText as unknown as MessagingClient['sendText'],
        markRead: vi.fn(async () => undefined),
      };
      return client;
    },
    ...overrides,
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

function statusPayload(waMessageId: string, status: string, timestamp: string) {
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
              statuses: [{ id: waMessageId, status, timestamp, recipient_id: ALLOWED }],
            },
          },
        ],
      },
    ],
  };
}

async function storeEvent(payload: Record<string, unknown>): Promise<string> {
  const [event] = await app.db
    .insert(inboundMetaEvents)
    .values({ object: 'whatsapp_business_account', payload })
    .returning({ id: inboundMetaEvents.id });
  return event!.id;
}

const tenantMessages = () => withTenant(app.db, TENANT, (tx) => tx.select().from(messages));

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerUrl = container.getConnectionUri();
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`CREATE ROLE qualify_app LOGIN PASSWORD 'app_pw'`);
  await owner.end();
  await runMigrations(ownerUrl);

  const seed = createDb(ownerUrl, { max: 1 });
  await seed.db
    .insert(organization)
    .values({ id: TENANT, name: 'Travel', slug: 'travel', createdAt: new Date() });
  await seed.db.insert(tenants).values({ id: TENANT });
  const [account] = await seed.db
    .insert(whatsappAccounts)
    .values({
      tenantId: TENANT,
      wabaId: 'WABA_DEV',
      onboardingType: 'dev',
      accessTokenEnc: encryptSecret('EAAG-dev-token', masterKey),
    })
    .returning();
  await seed.db.insert(phoneNumbers).values({
    tenantId: TENANT,
    whatsappAccountId: account!.id,
    phoneNumberId: PHONE_NUMBER_ID,
    displayPhone: '+91 93509 83656',
  });
  await seed.pool.end();

  const appUrl = new URL(ownerUrl);
  appUrl.username = 'qualify_app';
  appUrl.password = 'app_pw';
  app = createDb(appUrl.toString(), { max: 3 });
}, 180_000);

afterAll(async () => {
  await app?.pool.end();
  await container?.stop();
});

beforeEach(() => {
  sendText = vi.fn(async () => ({ messageId: `wamid.out.${Math.random()}` }));
  tokensSeen = [];
});

describe('processMetaEvent', () => {
  it('stores the lead and message, and replies once to an allow-listed number', async () => {
    const eventId = await storeEvent(inboundPayload(ALLOWED, 'wamid.in.1', 'Dubai package price?'));

    await processMetaEvent(eventId, deps());

    const [lead] = await withTenant(app.db, TENANT, (tx) => tx.select().from(leads));
    expect(lead).toMatchObject({
      phoneE164: `+${ALLOWED}`,
      name: 'Rahul Sharma',
      source: 'whatsapp_inbound',
    });

    const stored = await tenantMessages();
    const inbound = stored.find((row) => row.waMessageId === 'wamid.in.1');
    const outbound = stored.find((row) => row.direction === 'outbound');
    expect(inbound).toMatchObject({
      direction: 'inbound',
      sender: 'lead',
      body: 'Dubai package price?',
    });
    expect(outbound).toMatchObject({ status: 'sent', sender: 'system' });

    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0]?.[0]).toMatchObject({
      phoneNumberId: PHONE_NUMBER_ID,
      to: ALLOWED,
    });
    expect(tokensSeen).toEqual(['EAAG-dev-token']); // decrypted per tenant

    const [event] = await app.db
      .select()
      .from(inboundMetaEvents)
      .where(eq(inboundMetaEvents.id, eventId));
    expect(event?.processedAt).not.toBeNull();
  });

  it('never replies twice: re-processing or a Meta retry of the same message is a no-op', async () => {
    const before = (await tenantMessages()).length;

    const firstEventId = (await app.db.select().from(inboundMetaEvents).limit(1))[0]!.id;
    await processMetaEvent(firstEventId, deps()); // same event again
    const retryEventId = await storeEvent(
      inboundPayload(ALLOWED, 'wamid.in.1', 'Dubai package price?'),
    );
    await processMetaEvent(retryEventId, deps()); // Meta re-delivered the same message

    expect(sendText).not.toHaveBeenCalled();
    expect((await tenantMessages()).length).toBe(before);
  });

  it('stores but does not answer numbers outside DEV_ALLOWED_NUMBERS', async () => {
    const eventId = await storeEvent(inboundPayload(STRANGER, 'wamid.in.2', 'hello'));
    await processMetaEvent(eventId, deps());

    expect(sendText).not.toHaveBeenCalled();
    const stored = await tenantMessages();
    expect(stored.some((row) => row.waMessageId === 'wamid.in.2')).toBe(true);
  });

  it('applies delivery statuses in order and ignores late, older statuses', async () => {
    const outbound = (await tenantMessages()).find((row) => row.direction === 'outbound')!;
    for (const [status, ts] of [
      ['delivered', '1763400010'],
      ['read', '1763400020'],
      ['sent', '1763400005'], // arrives late
    ] as const) {
      await processMetaEvent(
        await storeEvent(statusPayload(outbound.waMessageId!, status, ts)),
        deps(),
      );
    }
    const [updated] = await withTenant(app.db, TENANT, (tx) =>
      tx.select().from(messages).where(eq(messages.id, outbound.id)),
    );
    expect(updated?.status).toBe('read');
  });

  it('records a failed reply when the Cloud API rejects it', async () => {
    sendText = vi.fn(async () => {
      throw new MetaApiError(400, 'Re-engagement message', 131047, {});
    });
    await processMetaEvent(
      await storeEvent(inboundPayload(ALLOWED, 'wamid.in.3', 'still there?')),
      deps(),
    );

    const failed = (await tenantMessages()).find(
      (row) => row.direction === 'outbound' && row.status === 'failed',
    );
    expect(failed?.error).toMatchObject({ code: 131047, status: 400 });
  });

  it('ignores webhooks for phone numbers that belong to no tenant', async () => {
    const before = (await tenantMessages()).length;
    const eventId = await storeEvent(inboundPayload(ALLOWED, 'wamid.in.4', 'hi', 'PN_UNKNOWN'));
    await processMetaEvent(eventId, deps());
    expect((await tenantMessages()).length).toBe(before);
    expect(sendText).not.toHaveBeenCalled();
  });
});
