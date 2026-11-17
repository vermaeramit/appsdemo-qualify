import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { organization } from './auth.ts';

export const DEFAULT_PARTNER_ID = 'default';

/** Agencies / resellers (Phase 2–3). Direct customers belong to the "default" partner. Platform-level: no RLS. */
export const partners = pgTable('partners', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  type: text('type', { enum: ['default', 'agency', 'reseller'] })
    .notNull()
    .default('default'),
  branding: jsonb('branding').$type<Record<string, unknown>>().notNull().default({}),
  customDomain: text('custom_domain').unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per workspace (= Better Auth organization, same id). Tenant-scoped: RLS on `id`.
 * Created by the organization `afterCreateOrganization` hook.
 */
export const tenants = pgTable('tenants', {
  id: text('id')
    .primaryKey()
    .references(() => organization.id, { onDelete: 'cascade' }),
  partnerId: text('partner_id')
    .notNull()
    .default(DEFAULT_PARTNER_ID)
    .references(() => partners.id),
  status: text('status', { enum: ['active', 'suspended'] })
    .notNull()
    .default('active'),
  defaultLanguage: text('default_language').notNull().default('hinglish'),
  allowedLanguages: text('allowed_languages')
    .array()
    .notNull()
    .default(sql`ARRAY['hinglish', 'en', 'hi']::text[]`),
  timezone: text('timezone').notNull().default('Asia/Kolkata'),
  settings: jsonb('settings').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/** Tenant audit trail (who did what, when). Tenant-scoped: RLS on `tenant_id`. */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    actorUserId: text('actor_user_id'),
    action: text('action').notNull(),
    target: text('target'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('audit_logs_tenant_created_idx').on(table.tenantId, table.createdAt)],
);
