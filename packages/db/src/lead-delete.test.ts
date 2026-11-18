// Integration test: deleting a lead removes everything carrying its data (real Postgres, RLS).
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client.ts';
import { deleteLeadCompletely } from './lead-delete.ts';
import { runMigrations } from './migrate.ts';
import {
  auditLogs,
  leadFormSubmissions,
  leads,
  messages,
  organization,
  tenants,
  webhookDeliveries,
  webhookEndpoints,
} from './schema/index.ts';
import { withTenant } from './tenant.ts';

const APP_PASSWORD = 'test_app_password';
let container: StartedPostgreSqlContainer;
let app: DbHandle;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerUrl = container.getConnectionUri();
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`CREATE ROLE qualify_app LOGIN PASSWORD '${APP_PASSWORD}'`);
  await owner.end();
  await runMigrations(ownerUrl);
  const seed = createDb(ownerUrl, { max: 1 });
  await seed.db.insert(organization).values([
    { id: 'org_a', name: 'A', slug: 'a', createdAt: new Date() },
    { id: 'org_b', name: 'B', slug: 'b', createdAt: new Date() },
  ]);
  await seed.db.insert(tenants).values([{ id: 'org_a' }, { id: 'org_b' }]);
  await seed.pool.end();
  const appUrl = new URL(ownerUrl);
  appUrl.username = 'qualify_app';
  appUrl.password = APP_PASSWORD;
  app = createDb(appUrl.toString(), { max: 2 });
}, 180_000);

afterAll(async () => {
  await app?.pool.end();
  await container?.stop();
});

async function seedLead(tenantId: string, phone: string) {
  return withTenant(app.db, tenantId, async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({ tenantId, phoneE164: phone, name: 'Asha', source: 'meta_form' })
      .returning();
    await tx.insert(messages).values(
      ['Hi', 'Hello'].map((body, index) => ({
        tenantId,
        leadId: lead!.id,
        phoneNumberId: 'pn',
        direction: index === 0 ? ('inbound' as const) : ('outbound' as const),
        sender: index === 0 ? ('lead' as const) : ('ai' as const),
        type: 'text',
        body,
        waMessageId: `wamid.${tenantId}.${phone}.${index}`,
        status: 'sent' as const,
      })),
    );
    await tx.insert(leadFormSubmissions).values({
      tenantId,
      leadgenId: `lg_${tenantId}_${phone}`,
      pageId: 'page',
      formId: 'form',
      leadId: lead!.id,
      fieldData: [{ name: 'phone_number', values: [phone] }],
    });
    const [endpoint] = await tx
      .insert(webhookEndpoints)
      .values({
        tenantId,
        url: 'https://example.com/hook',
        secretEnc: 'enc',
        secretHint: 'whsec_ab',
        events: ['lead.created'],
      })
      .returning();
    await tx.insert(webhookDeliveries).values({
      tenantId,
      endpointId: endpoint!.id,
      eventId: '00000000-0000-4000-8000-000000000001',
      eventType: 'lead.created',
      leadId: lead!.id,
      payload: { lead: { phone } },
    });
    await tx.insert(auditLogs).values({
      tenantId,
      action: 'lead.received_from_form',
      target: lead!.id,
      metadata: { otherAnswers: [{ label: 'City', value: 'Pune' }] },
    });
    return lead!;
  });
}

describe('deleteLeadCompletely', () => {
  it('removes the lead, its messages, form submissions and deliveries, and redacts the audit', async () => {
    const lead = await seedLead('org_a', '+919800000001');
    const other = await seedLead('org_a', '+919800000002');
    const elsewhere = await seedLead('org_b', '+919800000001');

    // Another workspace can't delete it.
    expect(
      await withTenant(app.db, 'org_b', (tx) =>
        deleteLeadCompletely(tx, { tenantId: 'org_b', leadId: lead.id }),
      ),
    ).toBeNull();

    const result = await withTenant(app.db, 'org_a', (tx) =>
      deleteLeadCompletely(tx, { tenantId: 'org_a', leadId: lead.id }),
    );
    expect(result).toEqual({
      messages: 2,
      formSubmissions: 1,
      webhookDeliveries: 1,
      auditEntriesRedacted: 1,
    });

    const remaining = await withTenant(app.db, 'org_a', async (tx) => ({
      leads: await tx.select({ id: leads.id }).from(leads),
      messages: await tx.select({ leadId: messages.leadId }).from(messages),
      submissions: await tx
        .select({ leadId: leadFormSubmissions.leadId })
        .from(leadFormSubmissions),
      deliveries: await tx.select({ leadId: webhookDeliveries.leadId }).from(webhookDeliveries),
      audit: await tx.select().from(auditLogs).where(eq(auditLogs.target, lead.id)),
    }));
    expect(remaining.leads.map((row) => row.id)).toEqual([other.id]);
    expect(remaining.messages.every((row) => row.leadId === other.id)).toBe(true);
    expect(remaining.messages).toHaveLength(2);
    expect(remaining.submissions.map((row) => row.leadId)).toEqual([other.id]);
    expect(remaining.deliveries.map((row) => row.leadId)).toEqual([other.id]);
    expect(remaining.audit).toHaveLength(1);
    expect(remaining.audit[0]!.metadata).toEqual({ redacted: true });

    // The other workspace's lead with the same phone is untouched.
    const kept = await withTenant(app.db, 'org_b', (tx) =>
      tx.select({ id: leads.id }).from(leads).where(eq(leads.id, elsewhere.id)),
    );
    expect(kept).toHaveLength(1);
  });
});
