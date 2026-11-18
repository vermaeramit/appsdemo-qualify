import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { leads } from './messaging.ts';
import { tenants } from './platform.ts';

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/**
 * A Facebook Page whose lead forms feed this workspace. `page_id` routes leadgen webhooks to the
 * tenant (like phone_number_id for WhatsApp). The page token is AES-256-GCM encrypted. RLS.
 */
export const facebookPages = pgTable('facebook_pages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: text('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  pageId: text('page_id').notNull().unique(),
  name: text('name').notNull(),
  accessTokenEnc: text('access_token_enc').notNull(),
  status: text('status', { enum: ['active', 'disconnected'] })
    .notNull()
    .default('active'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/**
 * One Meta lead form submission, stored raw. `leadgen_id` is unique, so a retried webhook never
 * creates a second lead or a second opening message. RLS.
 */
export const leadFormSubmissions = pgTable(
  'lead_form_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    leadgenId: text('leadgen_id').notNull().unique(),
    pageId: text('page_id').notNull(),
    formId: text('form_id').notNull(),
    adId: text('ad_id'),
    leadId: uuid('lead_id').references(() => leads.id, { onDelete: 'set null' }),
    /** Meta's answers as received: [{ name, values }]. */
    fieldData: jsonb('field_data').$type<{ name: string; values: string[] }[]>().notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index('lead_form_submissions_tenant_form_idx').on(table.tenantId, table.formId),
    // Newest-first keyset pagination on (created_at, id), read by a backward scan.
    index('lead_form_submissions_tenant_created_idx').on(table.tenantId, table.createdAt, table.id),
  ],
);

/**
 * How a form's questions map to the playbook's question keys (null = not used). Worked out once
 * per form (by the AI, or by name when no AI is configured) and editable later. RLS.
 */
export const leadFormMappings = pgTable(
  'lead_form_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    formId: text('form_id').notNull(),
    formName: text('form_name'),
    mapping: jsonb('mapping').$type<Record<string, string | null>>().notNull(),
    source: text('source', { enum: ['ai', 'auto', 'manual'] }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('lead_form_mappings_form_uq').on(table.tenantId, table.formId)],
);
