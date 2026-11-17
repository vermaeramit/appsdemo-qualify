// Integration test: real Postgres (Testcontainers), real migrations, connected as qualify_app.
// Proves tenant isolation holds at the database level, independent of application code.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client.ts';
import { runMigrations } from './migrate.ts';
import { auditLogs, organization, partners, tenants } from './schema/index.ts';
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
