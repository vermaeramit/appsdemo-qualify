import { customType, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './platform.ts';

export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * Files used as template headers (image, video, PDF; D-084). The bytes are kept here because
 * WhatsApp needs the media again on every send; the uploaded WhatsApp media id is cached for
 * its 30-day lifetime. RLS.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['IMAGE', 'VIDEO', 'DOCUMENT'] }).notNull(),
    mime: text('mime').notNull(),
    fileName: text('file_name').notNull(),
    size: integer('size').notNull(),
    sha256: text('sha256').notNull(),
    bytes: bytea('bytes').notNull(),
    /** WhatsApp media id for sending, the number it was uploaded for, and when it expires. */
    waMediaId: text('wa_media_id'),
    waPhoneNumberId: text('wa_phone_number_id'),
    waMediaExpiresAt: timestamp('wa_media_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('media_assets_tenant_sha_idx').on(table.tenantId, table.sha256)],
);
