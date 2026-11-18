import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { LeadAttribution, LeadScoreDetails, LeadSignals } from '@qualify/shared';
import { tenants } from './platform.ts';
import { playbookVersions } from './playbooks.ts';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** A tenant's WhatsApp Business Account. Tenant-scoped (RLS). */
export const whatsappAccounts = pgTable('whatsapp_accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  wabaId: text('waba_id').notNull().unique(),
  onboardingType: text('onboarding_type', { enum: ['coexistence', 'cloud', 'dev'] }).notNull(),
  /** AES-256-GCM encrypted access token (never stored in plain text). */
  accessTokenEnc: text('access_token_enc').notNull(),
  status: text('status', { enum: ['active', 'disconnected'] })
    .notNull()
    .default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** A WhatsApp phone number. `phone_number_id` routes webhooks to the tenant. Tenant-scoped (RLS). */
export const phoneNumbers = pgTable('phone_numbers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  whatsappAccountId: uuid('whatsapp_account_id')
    .notNull()
    .references(() => whatsappAccounts.id, { onDelete: 'cascade' }),
  phoneNumberId: text('phone_number_id').notNull().unique(),
  displayPhone: text('display_phone').notNull(),
  displayName: text('display_name'),
  qualityRating: text('quality_rating'),
  isCoexistence: boolean('is_coexistence').notNull().default(false),
  status: text('status', { enum: ['active', 'disconnected'] })
    .notNull()
    .default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * A person who contacted (or was contacted by) a tenant. One row per phone per tenant.
 * M2 keeps it minimal; qualification fields and scoring arrive in M3–M4. Tenant-scoped (RLS).
 */
export const leads = pgTable(
  'leads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    phoneE164: text('phone_e164').notNull(),
    name: text('name'),
    source: text('source', { enum: ['whatsapp_inbound', 'meta_form', 'ctwa', 'api'] }).notNull(),
    /** new | engaged | qualified | disqualified | handoff | unresponsive (leadStatusSchema). */
    status: text('status').notNull().default('new'),
    /** Playbook version this conversation follows (pinned at first AI reply). */
    playbookVersionId: uuid('playbook_version_id').references(() => playbookVersions.id, {
      onDelete: 'set null',
    }),
    /** Where the latest enquiry came from (ad, form, API): leadAttributionSchema. */
    attribution: jsonb('attribution').$type<LeadAttribution>(),
    /** Collected qualification fields, normalised (key → value). */
    fields: jsonb('fields').$type<Record<string, string>>().notNull().default({}),
    language: text('language'),
    /** True when a human took over or the AI must stay silent for this lead. */
    aiPaused: boolean('ai_paused').notNull().default(false),
    signals: jsonb('signals').$type<LeadSignals>(),
    lastInboundAt: timestamp('last_inbound_at', { withTimezone: true }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true }),
    handoffAt: timestamp('handoff_at', { withTimezone: true }),
    /** Hybrid score 0–100 and grade (FR-7): live after each AI turn, final at completion. */
    score: integer('score'),
    grade: text('grade', { enum: ['hot', 'warm', 'cold', 'disqualified'] }),
    scoreDetails: jsonb('score_details').$type<LeadScoreDetails>(),
    /** 2–3 line conversation summary for the sales team (written at the final score). */
    summary: text('summary'),
    scoredAt: timestamp('scored_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex('leads_tenant_phone_uq').on(table.tenantId, table.phoneE164),
    index('leads_tenant_last_message_idx').on(table.tenantId, table.lastMessageAt),
    // Period filters (dashboard, costs) and newest-first lists.
    index('leads_tenant_created_idx').on(table.tenantId, table.createdAt, table.id),
    // Activity order (conversations), keyset on (activity, id). Ascending on purpose: a backward
    // scan gives `order by activity desc, id desc` exactly (drizzle's .desc() is NULLS LAST,
    // which doesn't match ORDER BY ... DESC).
    index('leads_tenant_activity_idx').on(
      table.tenantId,
      sql`coalesce(${table.lastMessageAt}, ${table.createdAt})`,
      table.id,
    ),
    index('leads_tenant_scored_idx').on(table.tenantId, table.scoredAt),
    // Leads list sorted by score (unscored last), keyset on (score, id).
    index('leads_tenant_score_idx').on(table.tenantId, sql`coalesce(${table.score}, -1)`, table.id),
  ],
);

/** Every WhatsApp message in or out. `wa_message_id` makes webhook processing idempotent. */
export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    phoneNumberId: text('phone_number_id').notNull(),
    direction: text('direction', { enum: ['inbound', 'outbound'] }).notNull(),
    sender: text('sender', { enum: ['lead', 'ai', 'human_app', 'system'] }).notNull(),
    type: text('type').notNull(),
    body: text('body'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    waMessageId: text('wa_message_id').unique(),
    status: text('status', {
      enum: ['received', 'pending', 'sent', 'delivered', 'read', 'failed'],
    }).notNull(),
    error: jsonb('error').$type<Record<string, unknown>>(),
    /** Meta's per-message pricing from status webhooks: { billable, category, type }. */
    pricing: jsonb('pricing').$type<{ billable?: boolean; category?: string; type?: string }>(),
    createdAt: createdAt(),
    statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }),
  },
  (table) => [
    // A lead's thread, keyset on (created_at, id), and its latest message.
    index('messages_tenant_lead_created_idx').on(
      table.tenantId,
      table.leadId,
      table.createdAt,
      table.id,
    ),
    // Period queries across leads (reply times, AI cost, paid messages).
    index('messages_tenant_created_idx').on(table.tenantId, table.createdAt),
  ],
);

/**
 * Raw Meta webhook deliveries (audit + replay). Platform-level: no RLS, because the tenant
 * is only known after parsing. Only the api (insert) and worker (read/update) touch it.
 */
export const inboundMetaEvents = pgTable(
  'inbound_meta_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    object: text('object'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => [index('inbound_meta_events_unprocessed_idx').on(table.processedAt, table.receivedAt)],
);
