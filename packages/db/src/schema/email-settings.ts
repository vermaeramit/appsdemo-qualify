import { sql } from 'drizzle-orm';
import { check, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * The platform's SMTP server (D-095), one row. Platform-level (no tenant): changed only through
 * the platform admin page; read by the worker for scheduled reports.
 */
export const smtpSettings = pgTable(
  'smtp_settings',
  {
    id: text('id').primaryKey().default('platform'),
    host: text('host').notNull(),
    port: integer('port').notNull(),
    security: text('security', { enum: ['starttls', 'ssl', 'none'] }).notNull(),
    username: text('username'),
    /** AES-256-GCM (ENCRYPTION_MASTER_KEY), like the Meta tokens. */
    passwordEnc: text('password_enc'),
    fromName: text('from_name').notNull(),
    fromEmail: text('from_email').notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('smtp_settings_single_row', sql`${table.id} = 'platform'`)],
);
