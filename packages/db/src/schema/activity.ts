import type { ActivityDetail } from '@qualify/shared';
import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { leads } from './messaging.ts';
import { tenants } from './platform.ts';

/**
 * Activity log (D-091): one row per thing that happened to a lead (message received, AI reply,
 * opening sent or refused, follow-up, webhook delivery, a teammate's action) or to the workspace.
 * Append-only, RLS, pruned after ACTIVITY_RETENTION_DAYS. A deleted lead takes its rows along.
 */
export const activityLog = pgTable(
  'activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    source: text('source', {
      enum: ['whatsapp', 'agent', 'outreach', 'lead', 'webhook', 'team'],
    }).notNull(),
    kind: text('kind').notNull(),
    level: text('level', { enum: ['info', 'warn', 'error'] })
      .notNull()
      .default('info'),
    message: text('message').notNull(),
    detail: jsonb('detail').$type<ActivityDetail>().notNull().default({}),
  },
  (table) => [
    // Workspace feed, newest first: keyset on (at, id), read backwards.
    index('activity_log_tenant_at_idx').on(table.tenantId, table.at, table.id),
    index('activity_log_tenant_source_at_idx').on(table.tenantId, table.source, table.at, table.id),
    // "Problems only" (warnings and errors are a small share of all rows).
    index('activity_log_tenant_problems_idx')
      .on(table.tenantId, table.at, table.id)
      .where(sql`${table.level} <> 'info'`),
    // One lead's timeline.
    index('activity_log_lead_at_idx').on(table.leadId, table.at, table.id),
    // Retention pruning across tenants.
    index('activity_log_at_idx').on(table.at),
  ],
);
