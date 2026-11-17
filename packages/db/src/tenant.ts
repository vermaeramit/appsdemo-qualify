import { sql } from 'drizzle-orm';
import type { Database } from './client.ts';

export type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Runs `fn` in a transaction scoped to one tenant. Every tenant-table query must go through here.
 *
 * `set_config(..., true)` is transaction-local, so the tenant id never leaks to the next
 * request that reuses this pooled connection. RLS policies read it with
 * `current_setting('app.tenant_id', true)`, which is NULL outside withTenant(): queries
 * on tenant tables then return nothing (fail closed).
 */
export async function withTenant<T>(
  db: Database,
  tenantId: string,
  fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
  if (!tenantId) throw new Error('withTenant: tenantId is required');
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
