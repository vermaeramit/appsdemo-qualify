// Integration test: real Postgres (Testcontainers), real migrations, connected as qualify_app.
// Proves tenant isolation holds at the database level, independent of application code.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client.ts';
import { createApiKey, resolveTenantByApiKey } from './api-keys.ts';
import { runMigrations } from './migrate.ts';
import {
  createPublishedPlaybook,
  getDefaultPublishedPlaybook,
  publishPlaybookVersion,
  resolvePlaybookForAttribution,
} from './playbooks.ts';
import { resolveTenantByPageId, resolveTenantByPhoneNumberId } from './routing.ts';
import { getMediaAsset, saveMediaAsset } from './media.ts';
import { dueEmailReportWork } from './email-reports.ts';
import {
  activityHealth,
  listActivity,
  pruneActivity,
  recordActivity,
  touchNumberEvent,
} from './activity.ts';
import { saveWhatsAppConnection } from './whatsapp-connect.ts';
import {
  aiPlatformSpendThisMonth,
  aiPriceTable,
  getAiSettings,
  listAiModels,
  loadAiAccess,
  recordAiUsage,
  saveAiModels,
  saveAiSettings,
} from './ai.ts';
import {
  activeSupportSession,
  endSupportSession,
  latestSupportSession,
  listSupportSessions,
  noteSupportView,
  openSupportSession,
} from './support.ts';
import type { PlaybookConfig } from '@qualify/shared';
import {
  activityLog,
  aiSettings,
  aiUsage,
  apiKeys,
  auditLogs,
  emailReportRuns,
  emailReports,
  facebookPages,
  leadFormMappings,
  leadFormSubmissions,
  leads,
  messages,
  organization,
  partners,
  phoneNumbers,
  playbooks,
  playbookVersions,
  supportSessions,
  tenants,
  webhookDeliveries,
  webhookEndpoints,
  whatsappAccounts,
} from './schema/index.ts';
import { withTenant } from './tenant.ts';

const APP_PASSWORD = 'test_app_password';

let container: StartedPostgreSqlContainer;
let app: DbHandle;

function errorText(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? ` ${error.cause.message}` : '';
  return `${error.message}${cause}`;
}

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerUrl = container.getConnectionUri();

  // As superuser: create the app login role (prod does this before migrations), migrate, seed.
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`CREATE ROLE qualify_app LOGIN PASSWORD '${APP_PASSWORD}'`);
  await owner.end();

  await runMigrations(ownerUrl);

  const seed = createDb(ownerUrl, { max: 1 });
  const now = new Date();
  await seed.db.insert(organization).values([
    { id: 'org_a', name: 'Workspace A', slug: 'a', createdAt: now },
    { id: 'org_b', name: 'Workspace B', slug: 'b', createdAt: now },
  ]);
  await seed.db.insert(tenants).values([{ id: 'org_a' }, { id: 'org_b' }]); // superuser bypasses RLS
  const [accountA, accountB] = await seed.db
    .insert(whatsappAccounts)
    .values([
      { tenantId: 'org_a', wabaId: 'waba_a', onboardingType: 'dev', accessTokenEnc: 'enc_a' },
      { tenantId: 'org_b', wabaId: 'waba_b', onboardingType: 'dev', accessTokenEnc: 'enc_b' },
    ])
    .returning();
  await seed.db.insert(phoneNumbers).values([
    {
      tenantId: 'org_a',
      whatsappAccountId: accountA!.id,
      phoneNumberId: 'pn_a',
      displayPhone: '+91 1',
    },
    {
      tenantId: 'org_b',
      whatsappAccountId: accountB!.id,
      phoneNumberId: 'pn_b',
      displayPhone: '+91 2',
    },
  ]);
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

describe('RLS tenant isolation (connected as qualify_app)', () => {
  it('sees only its own tenant row', async () => {
    const rows = await withTenant(app.db, 'org_a', (tx) => tx.select().from(tenants));
    expect(rows.map((row) => row.id)).toEqual(['org_a']);
  });

  it('returns nothing outside withTenant() (fail closed)', async () => {
    expect(await app.db.select().from(tenants)).toEqual([]);
    expect(await app.db.select().from(auditLogs)).toEqual([]);
  });

  it("cannot read another tenant's audit logs", async () => {
    await withTenant(app.db, 'org_a', (tx) =>
      tx.insert(auditLogs).values({ tenantId: 'org_a', action: 'test.created' }),
    );
    const seenByB = await withTenant(app.db, 'org_b', (tx) => tx.select().from(auditLogs));
    const seenByA = await withTenant(app.db, 'org_a', (tx) => tx.select().from(auditLogs));
    expect(seenByB).toEqual([]);
    expect(seenByA).toHaveLength(1);
  });

  it('cannot insert rows for another tenant', async () => {
    const attempt = withTenant(app.db, 'org_a', (tx) =>
      tx.insert(auditLogs).values({ tenantId: 'org_b', action: 'test.spoofed' }),
    );
    await expect(attempt).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
  });

  it('cannot update another tenant', async () => {
    const updated = await withTenant(app.db, 'org_a', (tx) =>
      tx.update(tenants).set({ timezone: 'UTC' }).where(eq(tenants.id, 'org_b')).returning(),
    );
    expect(updated).toEqual([]);
  });

  it('does not leak the tenant id to the next use of a pooled connection', async () => {
    await withTenant(app.db, 'org_a', async () => undefined);
    const result = await app.db.execute<{ tenant: string | null }>(
      sql`select current_setting('app.tenant_id', true) as tenant`,
    );
    expect([null, '']).toContain(result.rows[0]?.tenant ?? null);
  });

  it('cannot modify partners (platform-managed)', async () => {
    const attempt = app.db.insert(partners).values({ id: 'evil', name: 'Evil' });
    await expect(attempt).rejects.toSatisfy((error) => /permission denied/.test(errorText(error)));
  });
});

describe('Messaging tables and webhook routing (connected as qualify_app)', () => {
  it('resolves the tenant of a phone number without tenant context', async () => {
    expect(await resolveTenantByPhoneNumberId(app.db, 'pn_a')).toBe('org_a');
    expect(await resolveTenantByPhoneNumberId(app.db, 'pn_b')).toBe('org_b');
    expect(await resolveTenantByPhoneNumberId(app.db, 'pn_unknown')).toBeNull();
  });

  it('still cannot read phone numbers or WhatsApp accounts of another tenant', async () => {
    expect(await app.db.select().from(phoneNumbers)).toEqual([]);
    const seenByB = await withTenant(app.db, 'org_b', (tx) => tx.select().from(phoneNumbers));
    expect(seenByB.map((row) => row.phoneNumberId)).toEqual(['pn_b']);
    const accountsSeenByB = await withTenant(app.db, 'org_b', (tx) =>
      tx.select().from(whatsappAccounts),
    );
    expect(accountsSeenByB.map((row) => row.wabaId)).toEqual(['waba_b']);
  });

  it('isolates leads and messages, and rejects spoofed tenant ids', async () => {
    const lead = await withTenant(app.db, 'org_a', async (tx) => {
      const [created] = await tx
        .insert(leads)
        .values({ tenantId: 'org_a', phoneE164: '+919800000001', source: 'whatsapp_inbound' })
        .returning();
      await tx.insert(messages).values({
        tenantId: 'org_a',
        leadId: created!.id,
        phoneNumberId: 'pn_a',
        direction: 'inbound',
        sender: 'lead',
        type: 'text',
        body: 'Hi, Dubai package?',
        waMessageId: 'wamid.a1',
        status: 'received',
      });
      return created!;
    });

    const leadsSeenByB = await withTenant(app.db, 'org_b', (tx) => tx.select().from(leads));
    const messagesSeenByB = await withTenant(app.db, 'org_b', (tx) => tx.select().from(messages));
    expect(leadsSeenByB).toEqual([]);
    expect(messagesSeenByB).toEqual([]);

    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(messages).values({
        tenantId: 'org_a',
        leadId: lead.id,
        phoneNumberId: 'pn_b',
        direction: 'outbound',
        sender: 'ai',
        type: 'text',
        body: 'spoofed',
        status: 'pending',
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
  });

  it('dedupes webhook retries on wa_message_id', async () => {
    const duplicate = withTenant(app.db, 'org_a', async (tx) => {
      const [lead] = await tx.select().from(leads).limit(1);
      await tx.insert(messages).values({
        tenantId: 'org_a',
        leadId: lead!.id,
        phoneNumberId: 'pn_a',
        direction: 'inbound',
        sender: 'lead',
        type: 'text',
        body: 'retry',
        waMessageId: 'wamid.a1',
        status: 'received',
      });
    });
    await expect(duplicate).rejects.toSatisfy((error) => /duplicate key/.test(errorText(error)));
  });
});

describe('Playbooks and API keys (connected as qualify_app)', () => {
  const config = { persona: { name: 'Riya' } } as unknown as PlaybookConfig; // RLS test only

  it('isolates playbooks and their versions', async () => {
    await withTenant(app.db, 'org_a', (tx) =>
      createPublishedPlaybook(tx, {
        tenantId: 'org_a',
        name: 'A playbook',
        templateKey: null,
        config,
        isDefault: true,
      }),
    );
    expect(await app.db.select().from(playbooks)).toEqual([]);
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(playbooks))).toEqual([]);
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(playbookVersions))).toEqual(
      [],
    );
    const own = await withTenant(app.db, 'org_a', (tx) => getDefaultPublishedPlaybook(tx));
    expect(own?.versionNo).toBe(1);
  });

  it('publishes new immutable versions', async () => {
    const next = await withTenant(app.db, 'org_a', async (tx) => {
      const current = await getDefaultPublishedPlaybook(tx);
      return publishPlaybookVersion(tx, {
        tenantId: 'org_a',
        playbookId: current!.playbookId,
        config,
      });
    });
    expect(next.versionNo).toBe(2);
  });

  it('resolves API keys to their tenant, hides them from other tenants, honours revocation', async () => {
    const created = await withTenant(app.db, 'org_a', (tx) =>
      createApiKey(tx, { tenantId: 'org_a', name: 'Postman', createdBy: null }),
    );
    expect(created.key.startsWith('qk_live_')).toBe(true);
    expect(await resolveTenantByApiKey(app.db, created.key)).toBe('org_a');
    expect(await resolveTenantByApiKey(app.db, 'qk_live_not-a-real-key')).toBeNull();
    expect(await resolveTenantByApiKey(app.db, 'random')).toBeNull();

    expect(await app.db.select().from(apiKeys)).toEqual([]);
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(apiKeys))).toEqual([]);
    const [stored] = await withTenant(app.db, 'org_a', (tx) => tx.select().from(apiKeys));
    expect(stored?.keyHash).not.toContain(created.key); // only the hash is stored

    await withTenant(app.db, 'org_a', (tx) =>
      tx.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, created.id)),
    );
    expect(await resolveTenantByApiKey(app.db, created.key)).toBeNull();
  });
});

describe('Lead form tables and Page routing (connected as qualify_app)', () => {
  it('routes a Page to its tenant without exposing other tenants', async () => {
    await withTenant(app.db, 'org_a', (tx) =>
      tx.insert(facebookPages).values({
        tenantId: 'org_a',
        pageId: 'page_a',
        name: 'Page A',
        accessTokenEnc: 'enc-a',
      }),
    );
    expect(await resolveTenantByPageId(app.db, 'page_a')).toBe('org_a');
    expect(await resolveTenantByPageId(app.db, 'page_unknown')).toBeNull();
    expect(await app.db.select().from(facebookPages)).toEqual([]);
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(facebookPages))).toEqual([]);
  });

  it('isolates submissions and mappings, and dedupes leadgen ids', async () => {
    await withTenant(app.db, 'org_a', async (tx) => {
      await tx.insert(leadFormSubmissions).values({
        tenantId: 'org_a',
        leadgenId: 'lg_1',
        pageId: 'page_a',
        formId: 'form_1',
        fieldData: [{ name: 'full_name', values: ['Rahul'] }],
      });
      await tx
        .insert(leadFormMappings)
        .values({ tenantId: 'org_a', formId: 'form_1', mapping: {}, source: 'auto' });
    });
    expect(
      await withTenant(app.db, 'org_b', (tx) => tx.select().from(leadFormSubmissions)),
    ).toEqual([]);
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(leadFormMappings))).toEqual(
      [],
    );
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(leadFormSubmissions).values({
        tenantId: 'org_a',
        leadgenId: 'lg_spoof',
        pageId: 'page_a',
        formId: 'form_1',
        fieldData: [],
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
    const retry = withTenant(app.db, 'org_a', (tx) =>
      tx.insert(leadFormSubmissions).values({
        tenantId: 'org_a',
        leadgenId: 'lg_1',
        pageId: 'page_a',
        formId: 'form_1',
        fieldData: [],
      }),
    );
    await expect(retry).rejects.toSatisfy((error) => /duplicate key/.test(errorText(error)));
  });

  it('isolates webhook endpoints and deliveries', async () => {
    const [endpoint] = await withTenant(app.db, 'org_a', (tx) =>
      tx
        .insert(webhookEndpoints)
        .values({
          tenantId: 'org_a',
          url: 'https://example.com/hook',
          secretEnc: 'enc',
          secretHint: 'whsec_ab',
          events: ['lead.qualified'],
        })
        .returning(),
    );
    await withTenant(app.db, 'org_a', (tx) =>
      tx.insert(webhookDeliveries).values({
        tenantId: 'org_a',
        endpointId: endpoint!.id,
        eventId: '00000000-0000-4000-8000-000000000001',
        eventType: 'lead.qualified',
        payload: {},
      }),
    );
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(webhookEndpoints))).toEqual(
      [],
    );
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(webhookDeliveries))).toEqual(
      [],
    );
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(webhookEndpoints).values({
        tenantId: 'org_a',
        url: 'https://evil.example/hook',
        secretEnc: 'enc',
        secretHint: 'whsec_xx',
        events: ['lead.created'],
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
  });

  it('refuses to connect a WhatsApp account that belongs to another tenant', async () => {
    const connection = (tenantId: string) => ({
      tenantId,
      wabaId: 'waba_shared_test',
      onboardingType: 'coexistence' as const,
      accessTokenEnc: 'enc',
      phone: {
        phoneNumberId: 'pn_shared_test',
        displayPhone: '+91 3',
        displayName: 'Shared',
        qualityRating: 'GREEN',
      },
    });
    const saved = await withTenant(app.db, 'org_a', (tx) =>
      saveWhatsAppConnection(tx, connection('org_a')),
    );
    expect(saved.phoneId).toBeTruthy();
    // Connecting again in the same tenant refreshes the token.
    await withTenant(app.db, 'org_a', (tx) => saveWhatsAppConnection(tx, connection('org_a')));
    const takeover = withTenant(app.db, 'org_b', (tx) =>
      saveWhatsAppConnection(tx, connection('org_b')),
    );
    await expect(takeover).rejects.toSatisfy((error) =>
      /row-level security/.test(errorText(error)),
    );
  });

  it('isolates media assets and dedupes identical uploads', async () => {
    const bytes = Buffer.from('fake png bytes');
    const first = await withTenant(app.db, 'org_a', (tx) =>
      saveMediaAsset(tx, {
        tenantId: 'org_a',
        kind: 'IMAGE',
        mime: 'image/png',
        fileName: 'a.png',
        bytes,
      }),
    );
    const again = await withTenant(app.db, 'org_a', (tx) =>
      saveMediaAsset(tx, {
        tenantId: 'org_a',
        kind: 'IMAGE',
        mime: 'image/png',
        fileName: 'b.png',
        bytes,
      }),
    );
    expect(again.id).toBe(first.id);
    expect(await withTenant(app.db, 'org_b', (tx) => getMediaAsset(tx, first.id))).toBeNull();
    const stored = await withTenant(app.db, 'org_a', (tx) => getMediaAsset(tx, first.id));
    expect(stored?.bytes.toString()).toBe('fake png bytes');
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      saveMediaAsset(tx, {
        tenantId: 'org_a',
        kind: 'IMAGE',
        mime: 'image/jpeg',
        fileName: 'x.jpg',
        bytes,
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
  });

  it('isolates e-mail reports and their runs; the due lookup returns ids only (D-088)', async () => {
    const [report] = await withTenant(app.db, 'org_a', (tx) =>
      tx
        .insert(emailReports)
        .values({
          tenantId: 'org_a',
          name: 'Daily',
          recipients: ['a@example.com'],
          frequency: 'daily',
          sendTime: '09:00',
          timeZone: 'Asia/Kolkata',
          nextRunAt: new Date(Date.now() - 60_000),
        })
        .returning(),
    );
    await withTenant(app.db, 'org_a', (tx) =>
      tx.insert(emailReportRuns).values({
        tenantId: 'org_a',
        reportId: report!.id,
        trigger: 'manual',
        periodFrom: '2026-11-18',
        periodTo: '2026-11-18',
        recipients: ['a@example.com'],
      }),
    );
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(emailReports))).toEqual([]);
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(emailReportRuns))).toEqual(
      [],
    );
    // Outside any tenant the minute tick sees the due report, and nothing but its ids.
    const due = await dueEmailReportWork(app.db);
    expect(due).toContainEqual({ kind: 'report', tenantId: 'org_a', id: report!.id });
    const direct = app.db.execute(sql`select recipients from email_reports`);
    expect(((await direct).rows as unknown[]).length).toBe(0);
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(emailReports).values({
        tenantId: 'org_a',
        name: 'Spoof',
        recipients: ['x@example.com'],
        frequency: 'daily',
        sendTime: '09:00',
        timeZone: 'UTC',
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
    await withTenant(app.db, 'org_a', (tx) =>
      tx.delete(emailReports).where(eq(emailReports.id, report!.id)),
    );
  });

  it('routes a new enquiry to the matching agent, else the default (D-086)', async () => {
    const config = (name: string) => ({ persona: { name } }) as unknown as PlaybookConfig;
    const routed = await withTenant(app.db, 'org_a', async (tx) => {
      const intl = await createPublishedPlaybook(tx, {
        tenantId: 'org_a',
        name: 'International',
        templateKey: null,
        config: config('Intl'),
        isDefault: false,
      });
      await tx
        .update(playbooks)
        .set({
          routes: [
            { type: 'form', value: 'form_intl' },
            { type: 'ad', value: 'ad_9' },
            { type: 'campaign', value: 'Europe Summer' },
          ],
        })
        .where(eq(playbooks.id, intl!.playbookId));
      return intl!;
    });
    const resolve = (
      tenantId: string,
      attribution: Parameters<typeof resolvePlaybookForAttribution>[1],
    ) => withTenant(app.db, tenantId, (tx) => resolvePlaybookForAttribution(tx, attribution));
    const at = new Date().toISOString();
    expect(
      (await resolve('org_a', { channel: 'meta_form', at, formId: 'form_intl' }))?.playbookId,
    ).toBe(routed.playbookId);
    expect((await resolve('org_a', { channel: 'ctwa', at, adId: 'ad_9' }))?.playbookId).toBe(
      routed.playbookId,
    );
    expect(
      (await resolve('org_a', { channel: 'api', at, campaign: ' europe summer ' }))?.playbookId,
    ).toBe(routed.playbookId);
    const fallback = await resolve('org_a', { channel: 'api', at, campaign: 'Other' });
    expect(fallback?.playbookId).not.toBe(routed.playbookId);
    expect(fallback).not.toBeNull();
    // Another workspace never sees these routes.
    const elsewhere = await resolve('org_b', { channel: 'meta_form', at, formId: 'form_intl' });
    expect(elsewhere?.playbookId).not.toBe(routed.playbookId);
  });
});

describe('Activity log (connected as qualify_app, D-091)', () => {
  it('isolates entries per tenant and refuses spoofed tenant ids', async () => {
    expect(
      await recordActivity(app.db, {
        tenantId: 'org_a',
        source: 'team',
        kind: 'test.entry',
        message: 'Only A sees this',
      }),
    ).toBeNull();
    const seenByB = await withTenant(app.db, 'org_b', (tx) => tx.select().from(activityLog));
    expect(seenByB.filter((row) => row.kind === 'test.entry')).toEqual([]);
    const seenByA = await withTenant(app.db, 'org_a', (tx) => tx.select().from(activityLog));
    expect(seenByA.filter((row) => row.kind === 'test.entry')).toHaveLength(1);
    expect(await app.db.select().from(activityLog)).toEqual([]);
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(activityLog).values({
        tenantId: 'org_a',
        source: 'team',
        kind: 'test.spoof',
        message: 'x',
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
  });

  it('lists a lead timeline and the workspace feed with filters and a cursor', async () => {
    const lead = await withTenant(app.db, 'org_a', async (tx) => {
      const [created] = await tx
        .insert(leads)
        .values({ tenantId: 'org_a', phoneE164: '+919811100001', name: 'Timeline', source: 'api' })
        .returning({ id: leads.id });
      return created!.id;
    });
    const base = { tenantId: 'org_a', leadId: lead } as const;
    for (const [index, entry] of [
      { source: 'lead', kind: 'lead.created', message: 'Lead added' },
      { source: 'outreach', kind: 'outreach.opening_sent', message: 'Opening sent' },
      { source: 'agent', kind: 'agent.failed', level: 'error', message: 'AI reply failed' },
      { source: 'whatsapp', kind: 'whatsapp.received', message: 'Message from the lead' },
    ].entries()) {
      await withTenant(app.db, 'org_a', (tx) =>
        tx.insert(activityLog).values({
          ...base,
          ...(entry as { source: 'lead'; kind: string; message: string }),
          level: (entry as { level?: 'error' }).level ?? 'info',
          at: new Date(Date.now() - (10 - index) * 1_000),
          detail: { Step: index },
        }),
      );
    }
    const first = await withTenant(app.db, 'org_a', (tx) =>
      listActivity(tx, { leadId: lead, limit: 3 }),
    );
    expect(first.items.map((item) => item.kind)).toEqual([
      'whatsapp.received',
      'agent.failed',
      'outreach.opening_sent',
    ]);
    expect(first.items[0]!.lead).toEqual({ id: lead, name: 'Timeline', phone: '+919811100001' });
    const second = await withTenant(app.db, 'org_a', (tx) =>
      listActivity(tx, { leadId: lead, limit: 3, before: first.next }),
    );
    expect(second.items.map((item) => item.kind)).toEqual(['lead.created']);
    expect(second.next).toBeNull();
    const problems = await withTenant(app.db, 'org_a', (tx) =>
      listActivity(tx, { problems: true, limit: 10 }),
    );
    expect(problems.items.map((item) => item.message)).toEqual(['AI reply failed']);
    const outreach = await withTenant(app.db, 'org_a', (tx) =>
      listActivity(tx, { source: 'outreach', limit: 10 }),
    );
    expect(outreach.items.map((item) => item.kind)).toEqual(['outreach.opening_sent']);
    expect(
      (await withTenant(app.db, 'org_b', (tx) => listActivity(tx, { leadId: lead, limit: 10 })))
        .items,
    ).toEqual([]);
  });

  it('says when Meta stopped reaching us after we sent a message', async () => {
    const lead = await withTenant(app.db, 'org_b', async (tx) => {
      const [created] = await tx
        .insert(leads)
        .values({ tenantId: 'org_b', phoneE164: '+919811100002', source: 'api' })
        .returning({ id: leads.id });
      return created!.id;
    });
    const health = () => withTenant(app.db, 'org_b', (tx) => activityHealth(tx));
    expect((await health()).problem).toBeNull();
    // We sent a message 10 minutes ago and Meta has sent nothing since.
    await withTenant(app.db, 'org_b', (tx) =>
      tx.insert(messages).values({
        tenantId: 'org_b',
        leadId: lead,
        phoneNumberId: 'pn_b',
        direction: 'outbound',
        sender: 'ai',
        type: 'text',
        body: 'Hi',
        waMessageId: 'wamid.health.1',
        status: 'sent',
        createdAt: new Date(Date.now() - 10 * 60_000),
      }),
    );
    const silent = await health();
    expect(silent.problem).toBe('silent');
    expect(silent.number).toEqual({ phone: '+91 2', lastEventAt: null });
    // A webhook for the number clears it.
    await touchNumberEvent(app.db, 'org_b', 'pn_b');
    const ok = await health();
    expect(ok.problem).toBeNull();
    expect(ok.number?.lastEventAt).not.toBeNull();
  });

  it('prunes only old entries, across tenants, through the narrow function', async () => {
    const old = new Date(Date.now() - 40 * 86_400_000);
    for (const tenantId of ['org_a', 'org_b']) {
      await withTenant(app.db, tenantId, (tx) =>
        tx.insert(activityLog).values([
          { tenantId, source: 'team', kind: 'test.old', message: 'old', at: old },
          { tenantId, source: 'team', kind: 'test.recent', message: 'recent' },
        ]),
      );
    }
    expect(await pruneActivity(app.db, 30)).toBe(2);
    for (const tenantId of ['org_a', 'org_b']) {
      const kinds = (await withTenant(app.db, tenantId, (tx) => tx.select().from(activityLog))).map(
        (row) => row.kind,
      );
      expect(kinds).not.toContain('test.old');
      expect(kinds).toContain('test.recent');
    }
    // Never below 7 days, and the app role can't delete across tenants itself.
    await expect(pruneActivity(app.db, 1)).rejects.toSatisfy((error) =>
      /at least 7 days/.test(errorText(error)),
    );
    const direct = await app.db.execute(sql`delete from activity_log returning id`);
    expect(direct.rows).toEqual([]);
  });
});

describe('Support access (connected as qualify_app, D-092)', () => {
  const base = {
    adminUserId: 'admin_1',
    adminName: 'Platform Admin',
    adminEmail: 'admin@example.com',
    returnWorkspaceId: 'org_b',
    reason: 'Client asked why a lead got no reply',
    minutes: 60,
  };

  it('keeps each access in its own workspace and refuses spoofed tenant ids', async () => {
    const opened = await openSupportSession(app.db, {
      ...base,
      tenantId: 'org_a',
      authSessionId: 'sess_isolation',
    });
    expect(opened.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000);
    const seenByB = await withTenant(app.db, 'org_b', (tx) => listSupportSessions(tx, 50));
    expect(seenByB.map((row) => row.id)).not.toContain(opened.id);
    const seenByA = await withTenant(app.db, 'org_a', (tx) => listSupportSessions(tx, 50));
    expect(seenByA.map((row) => row.id)).toContain(opened.id);
    expect(await app.db.select().from(supportSessions)).toEqual([]);
    // The audit entry is written with it, in the same workspace.
    const audit = await withTenant(app.db, 'org_a', (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.target, opened.id)),
    );
    expect(audit.map((row) => row.action)).toEqual(['support.opened']);
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(supportSessions).values({
        ...base,
        tenantId: 'org_a',
        authSessionId: 'sess_spoof',
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
  });

  it('holds for the same browser session and admin only, until it ends', async () => {
    await openSupportSession(app.db, { ...base, tenantId: 'org_a', authSessionId: 'sess_live' });
    expect(await activeSupportSession(app.db, 'org_a', 'sess_live', 'admin_1')).not.toBeNull();
    expect(await activeSupportSession(app.db, 'org_a', 'sess_other', 'admin_1')).toBeNull();
    expect(await activeSupportSession(app.db, 'org_a', 'sess_live', 'admin_2')).toBeNull();
    expect(await activeSupportSession(app.db, 'org_b', 'sess_live', 'admin_1')).toBeNull();

    const lead = crypto.randomUUID();
    const access = (await activeSupportSession(app.db, 'org_a', 'sess_live', 'admin_1'))!;
    expect(await noteSupportView(app.db, 'org_a', access.id, lead)).toBe(true);
    expect(await noteSupportView(app.db, 'org_a', access.id, lead)).toBe(false);
    expect(await noteSupportView(app.db, 'org_b', access.id, crypto.randomUUID())).toBe(false);

    const ended = await endSupportSession(app.db, 'org_a', 'sess_live');
    expect(ended?.endedAt).not.toBeNull();
    expect(ended?.viewedLeadIds).toEqual([lead]);
    expect(await endSupportSession(app.db, 'org_a', 'sess_live')).toBeNull();
    expect(await activeSupportSession(app.db, 'org_a', 'sess_live', 'admin_1')).toBeNull();
    expect((await latestSupportSession(app.db, 'org_a', 'sess_live'))?.returnWorkspaceId).toBe(
      'org_b',
    );
    const audit = await withTenant(app.db, 'org_a', (tx) =>
      tx.select().from(auditLogs).where(eq(auditLogs.target, access.id)),
    );
    expect(audit.map((row) => row.action).sort()).toEqual(['support.ended', 'support.opened']);
  });

  it('does not hold once expired', async () => {
    await openSupportSession(app.db, {
      ...base,
      tenantId: 'org_a',
      authSessionId: 'sess_expired',
      minutes: -1,
    });
    expect(await activeSupportSession(app.db, 'org_a', 'sess_expired', 'admin_1')).toBeNull();
    expect(await endSupportSession(app.db, 'org_a', 'sess_expired')).toBeNull();
  });

  it('cannot rewrite or delete the record', async () => {
    const opened = await openSupportSession(app.db, {
      ...base,
      tenantId: 'org_a',
      authSessionId: 'sess_tamper',
    });
    const rewrite = withTenant(app.db, 'org_a', (tx) =>
      tx
        .update(supportSessions)
        .set({ reason: 'nothing to see' })
        .where(eq(supportSessions.id, opened.id)),
    );
    await expect(rewrite).rejects.toSatisfy((error) => /permission denied/.test(errorText(error)));
    const remove = withTenant(app.db, 'org_a', (tx) =>
      tx.delete(supportSessions).where(eq(supportSessions.id, opened.id)),
    );
    await expect(remove).rejects.toSatisfy((error) => /permission denied/.test(errorText(error)));
  });
});

describe('AI provider per workspace (connected as qualify_app, D-094)', () => {
  it('seeds the price list, and saving moves the price date only when a price changes', async () => {
    const before = await listAiModels(app.db);
    expect(before.map((model) => model.id)).toContain('gpt-5.4-mini');
    const mini = before.find((model) => model.id === 'gpt-5.4-mini')!;
    await saveAiModels(app.db, [
      {
        id: 'gpt-5.4-mini',
        inputUsd: 0.75,
        cachedUsd: 0.075,
        outputUsd: 4.5,
        enabled: true,
        source: 'openrouter',
      },
      {
        id: 'gpt-test-1',
        label: 'Test',
        inputUsd: 1,
        cachedUsd: 0.1,
        outputUsd: 2,
        enabled: false,
        source: 'manual',
      },
    ]);
    const after = await listAiModels(app.db);
    const sameMini = after.find((model) => model.id === 'gpt-5.4-mini')!;
    expect(sameMini.pricesUpdatedAt.getTime()).toBe(mini.pricesUpdatedAt.getTime());
    expect(sameMini.source).toBe(mini.source);
    await saveAiModels(app.db, [
      {
        id: 'gpt-test-1',
        inputUsd: 3,
        cachedUsd: 0.3,
        outputUsd: 6,
        enabled: true,
        source: 'openrouter',
      },
    ]);
    const changed = (await listAiModels(app.db)).find((model) => model.id === 'gpt-test-1')!;
    expect(changed).toMatchObject({
      label: 'Test',
      inputUsd: 3,
      enabled: true,
      source: 'openrouter',
    });
    expect((await aiPriceTable(app.db))['gpt-test-1']).toEqual({
      input: 3,
      cached: 0.3,
      output: 6,
    });
  });

  it('keeps settings and usage per workspace and refuses spoofed tenant ids', async () => {
    await withTenant(app.db, 'org_a', (tx) =>
      saveAiSettings(tx, 'org_a', {
        mode: 'own_key',
        apiKeyEnc: 'enc',
        apiKeyHint: 'sk-…abcd',
        model: 'gpt-5.4-mini',
      }),
    );
    expect(await withTenant(app.db, 'org_b', (tx) => getAiSettings(tx))).toBeNull();
    expect((await withTenant(app.db, 'org_a', (tx) => getAiSettings(tx)))?.mode).toBe('own_key');
    expect(await app.db.select().from(aiSettings)).toEqual([]);
    const spoof = withTenant(app.db, 'org_b', (tx) =>
      tx.insert(aiSettings).values({ tenantId: 'org_a', mode: 'platform' }),
    );
    await expect(spoof).rejects.toSatisfy((error) => /row-level security/.test(errorText(error)));
    expect(
      await recordAiUsage(app.db, {
        tenantId: 'org_a',
        purpose: 'reply',
        model: 'gpt-5.4-mini',
        keySource: 'own',
        inputTokens: 100,
        cachedInputTokens: 0,
        outputTokens: 10,
        costUsd: 0.001,
      }),
    ).toBeNull();
    expect(await withTenant(app.db, 'org_b', (tx) => tx.select().from(aiUsage))).toEqual([]);
    // The usage record is append-only for the app.
    const rewrite = withTenant(app.db, 'org_a', (tx) => tx.update(aiUsage).set({ costUsd: 0 }));
    await expect(rewrite).rejects.toSatisfy((error) => /permission denied/.test(errorText(error)));
  });

  it('adds up this month spend on the AppsDemo key only', async () => {
    await withTenant(app.db, 'org_b', (tx) =>
      saveAiSettings(tx, 'org_b', { mode: 'platform', model: 'gpt-5.4-mini', monthlyLimitUsd: 5 }),
    );
    const base = {
      tenantId: 'org_b',
      purpose: 'reply' as const,
      model: 'gpt-5.4-mini',
      inputTokens: 1,
      cachedInputTokens: 0,
      outputTokens: 1,
    };
    await recordAiUsage(app.db, { ...base, keySource: 'platform', costUsd: 1.25 });
    await recordAiUsage(app.db, { ...base, keySource: 'platform', costUsd: 0.75 });
    await recordAiUsage(app.db, { ...base, keySource: 'own', costUsd: 9 });
    await withTenant(app.db, 'org_b', (tx) =>
      tx.insert(aiUsage).values({
        ...base,
        keySource: 'platform',
        costUsd: 50,
        at: new Date(Date.now() - 62 * 86_400_000),
      }),
    );
    expect(await withTenant(app.db, 'org_b', (tx) => aiPlatformSpendThisMonth(tx))).toBeCloseTo(2);
    const access = await loadAiAccess(app.db, 'org_b');
    expect(access.settings?.monthlyLimitUsd).toBe(5);
    expect(access.platformSpentUsd).toBeCloseTo(2);
  });

  it('a deleted lead keeps its usage rows (the lead link is cleared)', async () => {
    const lead = await withTenant(app.db, 'org_a', async (tx) => {
      const [created] = await tx
        .insert(leads)
        .values({ tenantId: 'org_a', phoneE164: '+919811100099', name: 'Usage', source: 'api' })
        .returning({ id: leads.id });
      return created!.id;
    });
    await recordAiUsage(app.db, {
      tenantId: 'org_a',
      leadId: lead,
      purpose: 'reply',
      model: 'gpt-5.4-mini',
      keySource: 'own',
      inputTokens: 5,
      cachedInputTokens: 0,
      outputTokens: 5,
      costUsd: 0.01,
    });
    await withTenant(app.db, 'org_a', (tx) => tx.delete(leads).where(eq(leads.id, lead)));
    const rows = await withTenant(app.db, 'org_a', (tx) => tx.select().from(aiUsage));
    expect(rows.some((row) => row.costUsd === 0.01 && row.leadId === null)).toBe(true);
  });
});
