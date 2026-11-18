import { leadScoreColumns, localToday } from '@qualify/core';
import {
  asc,
  type Database,
  eq,
  getDefaultPublishedPlaybook,
  gt,
  leads,
  tenants,
  withTenant,
} from '@qualify/db';

const FINAL = new Set(['qualified', 'handoff', 'disqualified', 'unresponsive']);

/**
 * Re-applies the workspace's current scoring to all its leads, in id-ordered batches (one short
 * transaction each), so it scales to large lead tables without long locks.
 */
export async function rescoreTenantLeads(
  db: Database,
  tenantId: string,
  options: { batchSize?: number } = {},
): Promise<{ total: number; grades: Record<string, number> }> {
  const batchSize = options.batchSize ?? 500;
  const setup = await withTenant(db, tenantId, async (tx) => {
    const playbook = await getDefaultPublishedPlaybook(tx);
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants).limit(1);
    return { playbook, timeZone: tenant?.timezone ?? 'Asia/Kolkata' };
  });
  if (!setup.playbook) return { total: 0, grades: {} };
  const config = setup.playbook.config;
  const today = localToday(setup.timeZone);
  const grades: Record<string, number> = {};
  let total = 0;
  let lastId: string | null = null;

  for (;;) {
    const after: string | null = lastId;
    const batch: { id: string }[] = await withTenant(db, tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: leads.id,
          fields: leads.fields,
          signals: leads.signals,
          status: leads.status,
          scoreDetails: leads.scoreDetails,
          scoredAt: leads.scoredAt,
        })
        .from(leads)
        .where(after ? gt(leads.id, after) : undefined)
        .orderBy(asc(leads.id))
        .limit(batchSize);
      for (const row of rows) {
        const columns = leadScoreColumns({
          config,
          fields: row.fields,
          signals: row.signals,
          status: row.status,
          today,
          final: row.scoreDetails?.final ?? FINAL.has(row.status),
          now: row.scoredAt ?? new Date(),
          previous: row.scoreDetails,
        });
        await tx.update(leads).set(columns).where(eq(leads.id, row.id));
        grades[columns.grade] = (grades[columns.grade] ?? 0) + 1;
      }
      return rows;
    });
    total += batch.length;
    if (batch.length < batchSize) break;
    lastId = batch.at(-1)!.id;
  }
  return { total, grades };
}
