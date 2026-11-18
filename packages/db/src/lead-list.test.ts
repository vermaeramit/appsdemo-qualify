// Integration test: the leads list (filters + keyset pagination per sort) on real Postgres.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client.ts';
import { type LeadListKey, type LeadListSort, listLeads } from './lead-list.ts';
import { runMigrations } from './migrate.ts';
import { leads, organization, tenants } from './schema/index.ts';
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
  await seed.db.insert(organization).values([
    { id: 'org_a', name: 'A', slug: 'a', createdAt: new Date() },
    { id: 'org_b', name: 'B', slug: 'b', createdAt: new Date() },
  ]);
  await seed.db.insert(tenants).values([{ id: 'org_a' }, { id: 'org_b' }]);
  const lead = (
    n: number,
    createdAt: string,
    extra: Partial<typeof leads.$inferInsert> = {},
    tenantId = 'org_a',
  ) => ({
    id: id(n),
    tenantId,
    phoneE164: `+91980000${String(n).padStart(4, '0')}`,
    name: `Lead ${n}`,
    source: 'api' as const,
    createdAt: new Date(createdAt),
    ...extra,
  });
  await seed.db.insert(leads).values([
    lead(1, '2026-11-10T04:00:00Z', { score: 85, grade: 'hot', status: 'qualified' }),
    lead(2, '2026-11-10T05:00:00Z', { score: 60, grade: 'warm', source: 'meta_form' }),
    lead(3, '2026-11-10T06:00:00Z', { status: 'contacting', name: 'Priya 50%_off' }),
    lead(4, '2026-11-11T04:00:00Z', { score: 60, grade: 'warm', source: 'ctwa' }),
    lead(5, '2026-11-11T05:00:00Z', {
      score: 20,
      grade: 'cold',
      lastMessageAt: new Date('2026-11-12T10:00:00Z'),
    }),
    lead(6, '2026-11-09T10:00:00Z', { score: 99, grade: 'hot' }), // before the range
    lead(7, '2026-11-10T07:00:00Z', { score: 70, grade: 'warm' }, 'org_b'), // another tenant
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

async function allPages(sort: LeadListSort, limit = 2): Promise<string[]> {
  const ids: string[] = [];
  let after: LeadListKey | null = null;
  for (let page = 0; page < 10; page++) {
    const result = await withTenant(app.db, 'org_a', (tx) =>
      listLeads(tx, { ...range, sort, limit, after }),
    );
    ids.push(...result.rows.map((row) => row.id));
    after = result.next;
    if (!after) break;
  }
  return ids;
}

describe('listLeads', () => {
  it('pages each sort without gaps or repeats', async () => {
    expect(await allPages('newest')).toEqual([id(5), id(4), id(3), id(2), id(1)]);
    // Highest score first; ties by id; unscored last.
    expect(await allPages('score')).toEqual([id(1), id(4), id(2), id(5), id(3)]);
    // Latest activity: lead 5 wrote on the 12th.
    expect((await allPages('activity'))[0]).toBe(id(5));
  });

  it('filters by text, phone, status, grade and source', async () => {
    const run = (filters: Parameters<typeof listLeads>[1] extends infer T ? Partial<T> : never) =>
      withTenant(app.db, 'org_a', (tx) =>
        listLeads(tx, { ...range, sort: 'newest', limit: 25, ...filters }),
      );
    const ids = async (filters: Parameters<typeof run>[0]) =>
      (await run(filters)).rows.map((row) => row.id);

    expect(await ids({ q: '50%_' })).toEqual([id(3)]); // LIKE wildcards are literal
    expect(await ids({ q: '0004' })).toEqual([id(4)]); // phone digits
    expect(await ids({ statuses: ['qualified', 'contacting'] })).toEqual([id(3), id(1)]);
    expect(await ids({ grades: ['warm'] })).toEqual([id(4), id(2)]);
    expect(await ids({ grades: ['hot', 'none'] })).toEqual([id(3), id(1)]);
    expect(await ids({ sources: ['ctwa', 'meta_form'] })).toEqual([id(4), id(2)]);
    expect((await run({ grades: ['warm'] })).total).toBe(2);
  });

  it('reads an index backwards for every sort (no sort step)', async () => {
    for (const [expr, index] of [
      ['l.created_at', 'leads_tenant_created_idx'],
      ['coalesce(l.score, -1)', 'leads_tenant_score_idx'],
      ['coalesce(l.last_message_at, l.created_at)', 'leads_tenant_activity_idx'],
    ] as const) {
      const plan = await withTenant(app.db, 'org_a', async (tx) => {
        await tx.execute(sql`set local enable_seqscan = off`);
        const result = await tx.execute<{ 'QUERY PLAN': string }>(
          sql.raw(`explain select l.id from leads l
            where (${expr}, l.id) < (${expr.includes('score') ? '50' : `'2026-11-11'::timestamptz`}, '${id(9)}'::uuid)
            order by ${expr} desc, l.id desc limit 26`),
        );
        return result.rows.map((row) => row['QUERY PLAN']).join('\n');
      });
      expect(plan).toContain(`Backward using ${index}`);
      expect(plan).not.toMatch(/\bSort\b/);
    }
  });
});
