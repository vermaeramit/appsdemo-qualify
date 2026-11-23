import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bytea } from './media.ts';
import { leads, messages } from './messaging.ts';
import { tenants } from './platform.ts';

/**
 * Files leads send on WhatsApp (D-100): a photo, voice note, video, document or sticker, one row
 * per message. Queued when the message arrives (pending), downloaded from Meta by the worker,
 * and emptied after INBOUND_MEDIA_RETENTION_DAYS (expired). Tenant-scoped: RLS.
 */
export const inboundMedia = pgTable(
  'inbound_media',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadId: uuid('lead_id')
      .notNull()
      .references(() => leads.id, { onDelete: 'cascade' }),
    messageId: uuid('message_id')
      .notNull()
      .unique()
      .references(() => messages.id, { onDelete: 'cascade' }),
    waMediaId: text('wa_media_id').notNull(),
    status: text('status', { enum: ['pending', 'stored', 'too_large', 'failed', 'expired'] })
      .notNull()
      .default('pending'),
    mime: text('mime'),
    fileName: text('file_name'),
    size: integer('size'),
    sha256: text('sha256'),
    bytes: bytea('bytes'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // Retention: stored files past their days, per workspace.
    index('inbound_media_tenant_created_idx')
      .on(table.tenantId, table.createdAt)
      .where(sql`${table.status} = 'stored'`),
    // Downloads that never ran (the job was lost): picked up again by the prune job.
    index('inbound_media_tenant_pending_idx')
      .on(table.tenantId, table.createdAt)
      .where(sql`${table.status} = 'pending'`),
  ],
);
