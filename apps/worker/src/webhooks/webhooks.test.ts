// Integration test: lead event → deliveries → signed POST to a local receiver (real Postgres).
import { randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { eq, leads, webhookDeliveries, webhookEndpoints, withTenant } from '@qualify/db';
import { encryptSecret, verifyWebhookSignature } from '@qualify/integrations';
import { type WebhookDeliveryJob, webhookPayloadSchema } from '@qualify/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import { DeliveryRetryError, processLeadEvent, processWebhookDelivery } from './webhooks.ts';

const masterKey = randomBytes(32);
const SECRET = 'whsec_test_secret';
let testDb: TestDb;
let server: Server;
let url: string;
const received: { headers: Record<string, string | string[] | undefined>; body: string }[] = [];
let replyStatus = 200;

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const policy = { allowPrivate: true, requireHttps: false };

beforeAll(async () => {
  testDb = await startTestDb(masterKey);
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.writeHead(replyStatus).end(replyStatus === 200 ? 'ok' : 'boom');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;
}, 180_000);

afterAll(async () => {
  server?.close();
  await testDb?.stop();
});

async function setup(grades: string[] = []) {
  return withTenant(testDb.app.db, TENANT, async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        tenantId: TENANT,
        phoneE164: `+91980000${Math.floor(Math.random() * 9000 + 1000)}`,
        name: 'Neha',
        source: 'meta_form',
        status: 'qualified',
        grade: 'warm',
        score: 61,
        fields: { destination: 'Goa', legacy_key: 'x' },
      })
      .returning();
    const [endpoint] = await tx
      .insert(webhookEndpoints)
      .values({
        tenantId: TENANT,
        url,
        secretEnc: encryptSecret(SECRET, masterKey),
        secretHint: 'whsec_te',
        events: ['lead.qualified'],
        grades,
      })
      .returning();
    return { lead: lead!, endpoint: endpoint! };
  });
}

describe('webhooks', () => {
  it('fans a lead event out to subscribed endpoints and delivers it signed', async () => {
    const { lead, endpoint } = await setup();
    const queued: WebhookDeliveryJob[] = [];
    const at = new Date().toISOString();
    const deps = {
      db: testDb.app.db,
      logger,
      appBaseUrl: 'https://qualify.example',
      enqueueDelivery: async (job: WebhookDeliveryJob) => void queued.push(job),
    };
    expect(
      await processLeadEvent({ tenantId: TENANT, leadId: lead.id, type: 'lead.created', at }, deps),
    ).toBe('no_endpoints');
    expect(
      await processLeadEvent(
        { tenantId: TENANT, leadId: lead.id, type: 'lead.qualified', at },
        deps,
      ),
    ).toBe(1);

    received.length = 0;
    replyStatus = 200;
    expect(
      await processWebhookDelivery(
        queued[0]!,
        { attemptsMade: 0, maxAttempts: 8 },
        {
          db: testDb.app.db,
          logger,
          masterKey,
          policy,
        },
      ),
    ).toBe('succeeded');

    const [request] = received;
    const signature = request!.headers['x-qualify-signature'] as string;
    expect(verifyWebhookSignature(SECRET, request!.body, signature)).toBe(true);
    expect(request!.headers['x-qualify-event']).toBe('lead.qualified');
    const payload = webhookPayloadSchema.parse(JSON.parse(request!.body));
    expect(payload.lead).toMatchObject({
      id: lead.id,
      name: 'Neha',
      grade: 'warm',
      score: 61,
      statusLabel: 'Qualified',
      sourceLabel: 'Meta lead form',
      otherAnswers: { legacy_key: 'x' },
      conversationUrl: `https://qualify.example/conversations?lead=${lead.id}`,
    });
    expect(payload.lead.answers).toContainEqual({
      key: 'destination',
      label: expect.any(String),
      value: 'Goa',
    });
    expect(request!.headers['x-qualify-event-id']).toBe(payload.id);

    const [stored] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, queued[0]!.deliveryId)),
    );
    expect(stored).toMatchObject({ status: 'succeeded', attempts: 1, responseStatus: 200 });
    const [updatedEndpoint] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.id, endpoint.id)),
    );
    expect(updatedEndpoint!.lastSuccessAt).not.toBeNull();
  });

  it('skips endpoints whose grade filter does not match', async () => {
    const { lead } = await setup(['hot']);
    const queued: WebhookDeliveryJob[] = [];
    // Two endpoints are subscribed now (the earlier one accepts every grade).
    const count = await processLeadEvent(
      { tenantId: TENANT, leadId: lead.id, type: 'lead.qualified', at: new Date().toISOString() },
      {
        db: testDb.app.db,
        logger,
        appBaseUrl: 'https://qualify.example',
        enqueueDelivery: async (job) => void queued.push(job),
      },
    );
    expect(count).toBe(1);
  });

  it('retries a failed delivery and records the final failure', async () => {
    const { lead } = await setup();
    const queued: WebhookDeliveryJob[] = [];
    await processLeadEvent(
      { tenantId: TENANT, leadId: lead.id, type: 'lead.qualified', at: new Date().toISOString() },
      {
        db: testDb.app.db,
        logger,
        appBaseUrl: 'https://qualify.example',
        enqueueDelivery: async (job) => void queued.push(job),
      },
    );
    const job = queued.at(-1)!;
    const deps = { db: testDb.app.db, logger, masterKey, policy };
    replyStatus = 500;
    await expect(
      processWebhookDelivery(job, { attemptsMade: 0, maxAttempts: 2 }, deps),
    ).rejects.toBeInstanceOf(DeliveryRetryError);
    let [stored] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, job.deliveryId)),
    );
    expect(stored).toMatchObject({ status: 'pending', attempts: 1, responseStatus: 500 });
    expect(stored!.nextAttemptAt).not.toBeNull();

    expect(await processWebhookDelivery(job, { attemptsMade: 1, maxAttempts: 2 }, deps)).toBe(
      'failed',
    );
    [stored] = await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(webhookDeliveries).where(eq(webhookDeliveries.id, job.deliveryId)),
    );
    expect(stored).toMatchObject({
      status: 'failed',
      attempts: 2,
      error: 'HTTP 500',
      responseExcerpt: 'boom',
      nextAttemptAt: null,
    });
  });

  it('never calls a private address when the policy forbids it', async () => {
    const { lead } = await setup();
    const queued: WebhookDeliveryJob[] = [];
    await processLeadEvent(
      { tenantId: TENANT, leadId: lead.id, type: 'lead.qualified', at: new Date().toISOString() },
      {
        db: testDb.app.db,
        logger,
        appBaseUrl: 'https://qualify.example',
        enqueueDelivery: async (job) => void queued.push(job),
      },
    );
    received.length = 0;
    const outcome = await processWebhookDelivery(
      queued.at(-1)!,
      { attemptsMade: 0, maxAttempts: 8 },
      {
        db: testDb.app.db,
        logger,
        masterKey,
        policy: { allowPrivate: false, requireHttps: false },
      },
    );
    expect(outcome).toBe('failed'); // no retries for a refused URL
    expect(received).toHaveLength(0);
  });
});
