import type { PlaybookConfig } from '@qualify/shared';
import { sql } from 'drizzle-orm';
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.ts';

/** A tenant's agent configuration. Tenant-scoped (RLS). One playbook per tenant is the default. */
export const playbooks = pgTable(
  'playbooks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Template it was created from (e.g. "travel-packages"), for upgrades/analytics. */
    templateKey: text('template_key'),
    isDefault: boolean('is_default').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex('playbooks_one_default_per_tenant')
      .on(table.tenantId)
      .where(sql`${table.isDefault}`),
  ],
);

/**
 * Immutable snapshots of a playbook's config. Conversations pin the version they started with,
 * so publishing a change never alters a running chat mid-way; rollback = publish an old config.
 */
export const playbookVersions = pgTable(
  'playbook_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    playbookId: uuid('playbook_id')
      .notNull()
      .references(() => playbooks.id, { onDelete: 'cascade' }),
    versionNo: integer('version_no').notNull(),
    status: text('status', { enum: ['draft', 'published'] }).notNull(),
    config: jsonb('config').$type<PlaybookConfig>().notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('playbook_versions_no_uq').on(table.playbookId, table.versionNo)],
);
