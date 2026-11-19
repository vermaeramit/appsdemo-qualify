import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './platform.ts';

/**
 * Support access (D-092): a platform admin views a client's workspace read-only. One row per
 * opening, kept for good (the audit record). Tenant-scoped: RLS on `tenant_id`.
 * The admin's name and e-mail are copied, so the record outlives the user.
 */
export const supportSessions = pgTable(
  'support_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    adminUserId: text('admin_user_id').notNull(),
    adminName: text('admin_name').notNull(),
    adminEmail: text('admin_email').notNull(),
    /** The admin's Better Auth session: access holds in that browser session only. */
    authSessionId: text('auth_session_id').notNull(),
    /** The admin's own workspace, opened again when they exit. */
    returnWorkspaceId: text('return_workspace_id'),
    reason: text('reason').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    /** Conversations opened during the access (each lead once). */
    viewedLeadIds: uuid('viewed_lead_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
  },
  (table) => [
    index('support_sessions_tenant_started_idx').on(table.tenantId, table.startedAt),
    index('support_sessions_auth_session_idx').on(table.tenantId, table.authSessionId),
  ],
);
