import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './platform.ts';

/**
 * Workspace API keys for server-to-server calls (inbound lead API, playbook API).
 * Only a SHA-256 hash is stored; the key is shown once at creation. Tenant-scoped (RLS).
 */
export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  /** First characters of the key, safe to display ("qk_live_ab12…"). */
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});
