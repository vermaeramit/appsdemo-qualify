import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
} from 'drizzle-orm/pg-core';
import { leads } from './messaging.ts';
import { tenants } from './platform.ts';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

/**
 * A URL that receives signed lead events (M7). The signing secret is AES-256-GCM encrypted
 * (we need it to sign). `grades` empty = every lead. RLS.
 */
export const webhookEndpoints = pgTable('webhook_endpoints', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  description: text('description'),
  secretEnc: text('secret_enc').notNull(),
  secretHint: text('secret_hint').notNull(),
  events: jsonb('events').$type<string[]>().notNull(),
  grades: jsonb('grades').$type<string[]>().notNull().default([]),
  active: boolean('active').notNull().default(true),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

/**
 * One event for one endpoint: the exact payload, and the outcome of the latest attempt. Retries
 * and resends update the same row. RLS.
 */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    /** Same for every endpoint and attempt of one event (receivers deduplicate on it). */
    eventId: uuid('event_id').notNull(),
    eventType: text('event_type').notNull(),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: text('status', { enum: ['pending', 'succeeded', 'failed'] })
      .notNull()
      .default('pending'),
    attempts: integer('attempts').notNull().default(0),
    responseStatus: integer('response_status'),
    responseExcerpt: text('response_excerpt'),
    error: text('error'),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // Delivery log per endpoint, newest first (keyset on created_at, id).
    index('webhook_deliveries_endpoint_created_idx').on(
      table.tenantId,
      table.endpointId,
      table.createdAt,
      table.id,
    ),
  ],
);
