import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './platform.ts';
import { playbooks } from './playbooks.ts';

/**
 * A scheduled e-mail report (FR-8.2, D-088): who gets it, when, and which leads it covers.
 * `next_run_at` is computed in Postgres (`next_email_report_run`) so the schedule follows the
 * report's time zone, daylight saving included. RLS.
 */
export const emailReports = pgTable(
  'email_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    recipients: jsonb('recipients').$type<string[]>().notNull(),
    frequency: text('frequency', { enum: ['daily', 'weekly', 'monthly'] }).notNull(),
    /** Local "HH:MM" in `time_zone`. */
    sendTime: text('send_time').notNull(),
    /** ISO weekday for weekly reports (Monday = 1). */
    weekday: smallint('weekday').notNull().default(1),
    timeZone: text('time_zone').notNull(),
    /** Grade filter (empty = every lead). */
    grades: jsonb('grades').$type<string[]>().notNull().default([]),
    /** Only this agent's leads; null = every agent. A deleted agent removes the filter. */
    agentId: uuid('agent_id').references(() => playbooks.id, { onDelete: 'set null' }),
    skipEmpty: boolean('skip_empty').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    nextRunAt: timestamp('next_run_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // The minute tick looks for due reports across tenants (narrow definer function).
    index('email_reports_due_idx')
      .on(table.nextRunAt)
      .where(sql`${table.enabled}`),
  ],
);

/** One sending of a report: the period it covered and what happened. RLS. */
export const emailReportRuns = pgTable(
  'email_report_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: text('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    reportId: uuid('report_id')
      .notNull()
      .references(() => emailReports.id, { onDelete: 'cascade' }),
    trigger: text('trigger', { enum: ['schedule', 'manual'] }).notNull(),
    /** The scheduled instant this run is for (schedule runs), so a slot is claimed once. */
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    periodFrom: date('period_from', { mode: 'string' }).notNull(),
    periodTo: date('period_to', { mode: 'string' }).notNull(),
    status: text('status', { enum: ['queued', 'sent', 'skipped', 'failed'] })
      .notNull()
      .default('queued'),
    leadCount: integer('lead_count'),
    recipients: jsonb('recipients').$type<string[]>().notNull(),
    error: text('error'),
    messageId: text('message_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
  },
  (table) => [
    index('email_report_runs_report_created_idx').on(
      table.tenantId,
      table.reportId,
      table.createdAt,
      table.id,
    ),
    uniqueIndex('email_report_runs_slot_uq')
      .on(table.reportId, table.scheduledFor)
      .where(sql`${table.scheduledFor} is not null`),
    // Runs left queued (lost enqueue) are picked up again by the tick.
    index('email_report_runs_queued_idx')
      .on(table.createdAt)
      .where(sql`${table.status} = 'queued'`),
  ],
);
