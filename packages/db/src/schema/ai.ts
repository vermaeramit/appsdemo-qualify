import { sql } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { leads } from './messaging.ts';
import { tenants } from './platform.ts';

/**
 * Models the platform offers and their list prices in USD per 1M tokens (D-094). Platform-level
 * (no tenant): read by every workspace, changed only through the platform admin page.
 */
export const aiModels = pgTable('ai_models', {
  id: text('id').primaryKey(),
  label: text('label'),
  inputUsd: doublePrecision('input_usd').notNull(),
  cachedUsd: doublePrecision('cached_usd').notNull(),
  outputUsd: doublePrecision('output_usd').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  source: text('source', { enum: ['manual', 'openrouter'] })
    .notNull()
    .default('manual'),
  pricesUpdatedAt: timestamp('prices_updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Each workspace's AI provider (D-094): its own OpenAI key (encrypted), AppsDemo's key (with a
 * monthly limit), or off. No row = off. Tenant-scoped: RLS on `tenant_id`.
 */
export const aiSettings = pgTable('ai_settings', {
  tenantId: text('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  mode: text('mode', { enum: ['off', 'own_key', 'platform'] })
    .notNull()
    .default('off'),
  /** AES-256-GCM (ENCRYPTION_MASTER_KEY), like the Meta tokens. */
  apiKeyEnc: text('api_key_enc'),
  /** "sk-…abcd", shown instead of the key. */
  apiKeyHint: text('api_key_hint'),
  /** The model replies use; null = the platform default. */
  model: text('model'),
  /** With AppsDemo's key only; null = no limit. */
  monthlyLimitUsd: doublePrecision('monthly_limit_usd'),
  /** Who switched AppsDemo's key on (a platform admin's name). */
  platformBy: text('platform_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One row per AI call (D-094): what it was for, the model, tokens, the estimated cost, and whose
 * key paid. The monthly limit on AppsDemo's key is checked against it. Tenant-scoped: RLS.
 */
export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    purpose: text('purpose', {
      enum: ['reply', 'follow_up', 'summary', 'form_mapping', 'test_chat'],
    }).notNull(),
    model: text('model').notNull(),
    keySource: text('key_source', { enum: ['own', 'platform'] }).notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: doublePrecision('cost_usd'),
  },
  (table) => [
    index('ai_usage_tenant_at_idx').on(table.tenantId, table.at),
    index('ai_usage_tenant_source_at_idx')
      .on(table.tenantId, table.keySource, table.at)
      .where(sql`${table.keySource} = 'platform'`),
  ],
);
