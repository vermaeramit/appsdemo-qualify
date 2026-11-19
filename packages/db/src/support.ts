import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { auditLogs } from './schema/platform.ts';
import { supportSessions } from './schema/support.ts';
import { type Transaction, withTenant } from './tenant.ts';

export type SupportSessionRow = typeof supportSessions.$inferSelect;

/** Most conversations noted per access (the record stays small). */
const MAX_VIEWED = 1_000;

export interface OpenSupportSessionInput {
  tenantId: string;
  adminUserId: string;
  adminName: string;
  adminEmail: string;
  authSessionId: string;
  returnWorkspaceId: string | null;
  reason: string;
  minutes: number;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/** Opens a read-only support access (D-092) and writes the workspace's audit entry with it. */
export async function openSupportSession(
  db: Database,
  input: OpenSupportSessionInput,
): Promise<SupportSessionRow> {
  return withTenant(db, input.tenantId, async (tx) => {
    const [row] = await tx
      .insert(supportSessions)
      .values({
        tenantId: input.tenantId,
        adminUserId: input.adminUserId,
        adminName: input.adminName,
        adminEmail: input.adminEmail,
        authSessionId: input.authSessionId,
        returnWorkspaceId: input.returnWorkspaceId,
        reason: input.reason,
        expiresAt: sql`now() + make_interval(mins => ${input.minutes})`,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning();
    await tx.insert(auditLogs).values({
      tenantId: input.tenantId,
      actorUserId: input.adminUserId,
      action: 'support.opened',
      target: row!.id,
      metadata: { admin: input.adminName, reason: input.reason, expiresAt: row!.expiresAt },
    });
    return row!;
  });
}

/** The open, unexpired support access of this admin's browser session in this workspace. */
export async function activeSupportSession(
  db: Database,
  tenantId: string,
  authSessionId: string,
  adminUserId: string,
): Promise<SupportSessionRow | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(supportSessions)
      .where(
        and(
          eq(supportSessions.authSessionId, authSessionId),
          eq(supportSessions.adminUserId, adminUserId),
          isNull(supportSessions.endedAt),
          gt(supportSessions.expiresAt, sql`now()`),
        ),
      )
      .orderBy(desc(supportSessions.startedAt))
      .limit(1),
  );
  return row ?? null;
}

/**
 * The latest access of this browser session in this workspace, open or not: where to return
 * to after it, even once it has expired.
 */
export async function latestSupportSession(
  db: Database,
  tenantId: string,
  authSessionId: string,
): Promise<SupportSessionRow | null> {
  const [row] = await withTenant(db, tenantId, (tx) =>
    tx
      .select()
      .from(supportSessions)
      .where(eq(supportSessions.authSessionId, authSessionId))
      .orderBy(desc(supportSessions.startedAt))
      .limit(1),
  );
  return row ?? null;
}

/** Ends this browser session's open access in the workspace (with its audit entry). */
export async function endSupportSession(
  db: Database,
  tenantId: string,
  authSessionId: string,
): Promise<SupportSessionRow | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .update(supportSessions)
      .set({ endedAt: sql`now()` })
      .where(
        and(
          eq(supportSessions.authSessionId, authSessionId),
          isNull(supportSessions.endedAt),
          gt(supportSessions.expiresAt, sql`now()`),
        ),
      )
      .returning();
    if (!row) return null;
    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: row.adminUserId,
      action: 'support.ended',
      target: row.id,
      metadata: { admin: row.adminName, conversationsViewed: row.viewedLeadIds.length },
    });
    return row;
  });
}

/** Notes a conversation opened during the access. True the first time for this lead. */
export async function noteSupportView(
  db: Database,
  tenantId: string,
  sessionId: string,
  leadId: string,
): Promise<boolean> {
  const rows = await withTenant(db, tenantId, (tx) =>
    tx
      .update(supportSessions)
      .set({ viewedLeadIds: sql`array_append(${supportSessions.viewedLeadIds}, ${leadId}::uuid)` })
      .where(
        and(
          eq(supportSessions.id, sessionId),
          sql`not (${leadId}::uuid = any(${supportSessions.viewedLeadIds}))`,
          sql`cardinality(${supportSessions.viewedLeadIds}) < ${MAX_VIEWED}`,
        ),
      )
      .returning({ id: supportSessions.id }),
  );
  return rows.length > 0;
}

/** The workspace's support accesses, newest first. */
export function listSupportSessions(tx: Transaction, limit: number): Promise<SupportSessionRow[]> {
  return tx.select().from(supportSessions).orderBy(desc(supportSessions.startedAt)).limit(limit);
}
