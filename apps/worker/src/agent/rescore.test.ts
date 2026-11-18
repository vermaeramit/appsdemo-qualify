// Integration test of batched rescoring: real Postgres (RLS).
import { randomBytes } from 'node:crypto';
import { leads, withTenant } from '@qualify/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import { rescoreTenantLeads } from './rescore.ts';

let testDb: TestDb;

beforeAll(async () => {
  testDb = await startTestDb(randomBytes(32));
  await withTenant(testDb.app.db, TENANT, (tx) =>
    tx.insert(leads).values(
      Array.from({ length: 5 }, (_, index) => ({
        tenantId: TENANT,
        phoneE164: `+9198000001${String(index).padStart(2, '0')}`,
        source: 'api' as const,
        status: index === 0 ? ('qualified' as const) : ('new' as const),
        fields: (index === 0 ? { passport_status: 'Ready' } : {}) as Record<string, string>,
      })),
    ),
  );
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

describe('rescoreTenantLeads', () => {
  it('scores every lead across batches and marks finished conversations final', async () => {
    const result = await rescoreTenantLeads(testDb.app.db, TENANT, { batchSize: 2 });
    expect(result.total).toBe(5);
    const rows = await withTenant(testDb.app.db, TENANT, (tx) => tx.select().from(leads));
    expect(rows.every((row) => row.score !== null && row.grade !== null)).toBe(true);
    const qualified = rows.find((row) => row.status === 'qualified')!;
    expect(qualified.scoreDetails?.final).toBe(true);
    expect(qualified.score).toBe(10); // passport Ready (travel template)
  });
});
