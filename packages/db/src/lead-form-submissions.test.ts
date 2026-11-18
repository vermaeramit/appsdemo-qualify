// Integration test: keyset pagination of lead form submissions on real Postgres, as qualify_app.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client.ts';
import {
  listLeadFormSubmissions,
  type SubmissionKey,
  type SubmissionRow,
} from './lead-form-submissions.ts';
import { runMigrations } from './migrate.ts';
import {
  facebookPages,
  leadFormMappings,
  leadFormSubmissions,
  leads,
  organization,
  tenants,
} from './schema/index.ts';
import { withTenant } from './tenant.ts';

const APP_PASSWORD = 'test_app_password';
const TZ = 'Asia/Kolkata';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

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
  const now = new Date();
  await seed.db.insert(organization).values([
    { id: 'org_a', name: 'A', slug: 'a', createdAt: now },
    { id: 'org_b', name: 'B', slug: 'b', createdAt: now },
  ]);
  await seed.db.insert(tenants).values([{ id: 'org_a' }, { id: 'org_b' }]);
  const [lead] = await seed.db
    .insert(leads)
    .values({ tenantId: 'org_a', phoneE164: '+919800000001', name: 'Asha', source: 'api' })
    .returning();
  await seed.db.insert(facebookPages).values({
    tenantId: 'org_a',
    pageId: 'page_a',
    name: 'Page A',
    accessTokenEnc: 'enc',
  });
  await seed.db.insert(leadFormMappings).values({
    tenantId: 'org_a',
    formId: 'form_1',
    formName: 'Spring offer',
    mapping: {},
    source: 'auto',
  });
  // Times in UTC; the range below is 10–11 Nov in India (UTC+5:30).
  const at = (iso: string) => new Date(iso);
  const submission = (n: number, createdAt: Date, formId: string, tenantId = 'org_a') => ({
    id: id(n),
    tenantId,
    leadgenId: `lg_${n}`,
    pageId: 'page_a',
    formId,
    fieldData: [{ name: 'full_name', values: [`Person ${n}`] }],
    createdAt,
  });
  await seed.db.insert(leadFormSubmissions).values([
    submission(1, at('2026-11-09T18:20:00Z'), 'form_1'), // 9 Nov 23:50 IST: before the range
    submission(2, at('2026-11-09T18:40:00Z'), 'form_1'), // 10 Nov 00:10 IST: first in range
    submission(3, at('2026-11-10T06:00:00Z'), 'form_2'),
    // Two at the same instant: the id breaks the tie.
    submission(4, at('2026-11-10T09:00:00.123456Z'), 'form_1'),
    submission(5, at('2026-11-10T09:00:00.123456Z'), 'form_1'),
    submission(6, at('2026-11-11T05:00:00Z'), 'form_2'),
    { ...submission(7, at('2026-11-11T18:00:00Z'), 'form_1'), leadId: lead!.id }, // 23:30 IST
    submission(8, at('2026-11-11T18:40:00Z'), 'form_1'), // 12 Nov 00:10 IST: after the range
    submission(9, at('2026-11-10T10:00:00Z'), 'form_1', 'org_b'), // another tenant
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

const range = { timeZone: TZ, from: '2026-11-10', to: '2026-11-11' };

describe('listLeadFormSubmissions', () => {
  it('pages newest first with no gaps or repeats, inside the local-day range', async () => {
    const seen: SubmissionRow[] = [];
    let after: SubmissionKey | null = null;
    let pages = 0;
    do {
      const page = await withTenant(app.db, 'org_a', (tx) =>
        listLeadFormSubmissions(tx, { ...range, limit: 2, after }),
      );
      expect(page.total).toBe(6);
      seen.push(...page.rows);
      after = page.next;
      pages += 1;
    } while (after && pages < 10);

    expect(pages).toBe(3);
    expect(seen.map((row) => row.id)).toEqual([id(7), id(6), id(5), id(4), id(3), id(2)]);
    const newest = seen[0]!;
    expect(newest.formName).toBe('Spring offer');
    expect(newest.pageName).toBe('Page A');
    expect(newest.leadName).toBe('Asha');
    expect(newest.fieldData).toEqual([{ name: 'full_name', values: ['Person 7'] }]);
  });

  it('filters by form and lists the forms in the range', async () => {
    const page = await withTenant(app.db, 'org_a', (tx) =>
      listLeadFormSubmissions(tx, { ...range, formId: 'form_2', limit: 25 }),
    );
    expect(page.rows.map((row) => row.id)).toEqual([id(6), id(3)]);
    expect(page.total).toBe(2);
    expect(page.next).toBeNull();
    expect(page.forms).toEqual([
      { formId: 'form_1', formName: 'Spring offer', count: 4 },
      { formId: 'form_2', formName: null, count: 2 },
    ]);
  });

  it('defaults to the last 30 days', async () => {
    const page = await withTenant(app.db, 'org_a', (tx) =>
      listLeadFormSubmissions(tx, { timeZone: TZ, limit: 25 }),
    );
    const days = (Date.parse(page.to) - Date.parse(page.from)) / 86_400_000;
    expect(days).toBe(29);
  });

  it('reads the index backwards for any page (no sort, cursor in the index condition)', async () => {
    const plan = await withTenant(app.db, 'org_a', async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const result = await tx.execute<{ 'QUERY PLAN': string }>(sql`
        explain select s.id from lead_form_submissions s
        where s.created_at >= '2026-11-01'::timestamptz and s.created_at < '2026-12-01'::timestamptz
          and (s.created_at, s.id) < ('2026-11-10 09:00:00.123456+00'::timestamptz, ${id(5)}::uuid)
        order by s.created_at desc, s.id desc limit 26`);
      return result.rows.map((row) => row['QUERY PLAN']).join('\n');
    });
    expect(plan).toContain(
      'Index Only Scan Backward using lead_form_submissions_tenant_created_idx',
    );
    expect(plan).not.toMatch(/\bSort\b/);
  });
});
