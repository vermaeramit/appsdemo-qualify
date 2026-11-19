import { z } from 'zod';
import { leadGradeSchema } from './lead.js';

/**
 * Scheduled e-mail reports (FR-8.2, D-088): a summary and an Excel of the leads that came in
 * during the last period, e-mailed to a few people on a schedule.
 */
export const reportFrequencySchema = z.enum(['daily', 'weekly', 'monthly']);
export type ReportFrequency = z.infer<typeof reportFrequencySchema>;

export const REPORT_FREQUENCY_LABELS: Record<ReportFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/** ISO weekday: Monday = 1 … Sunday = 7. */
export const WEEKDAY_LABELS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export const REPORT_MAX_RECIPIENTS = 10;

/** Only leads with these grades (empty = every lead); `none` = not scored yet. */
export const reportGradesSchema = z.array(z.union([leadGradeSchema, z.literal('none')])).max(5);

const recipientsSchema = z
  .array(z.email('Enter a valid e-mail address').max(254))
  .min(1, 'Add at least one e-mail address')
  .max(REPORT_MAX_RECIPIENTS, `Up to ${REPORT_MAX_RECIPIENTS} addresses`)
  .transform((list) => [...new Set(list.map((email) => email.trim().toLowerCase()))]);

export const emailReportInputSchema = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(80),
  recipients: recipientsSchema,
  frequency: reportFrequencySchema,
  /** Local time of day in `timeZone`, "HH:MM". */
  sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:00'),
  /** Weekly reports only (ISO weekday). Monthly reports go out on the 1st. */
  weekday: z.number().int().min(1).max(7).default(1),
  /** IANA time zone the schedule and the period follow, e.g. "Asia/Kolkata". */
  timeZone: z.string().trim().min(1).max(64),
  grades: reportGradesSchema.default([]),
  /** Only leads of this agent (D-086); null = every agent. */
  agentId: z.uuid().nullable().default(null),
  /** Don't send when the period has no leads. */
  skipEmpty: z.boolean().default(false),
  enabled: z.boolean().default(true),
});
export type EmailReportInput = z.input<typeof emailReportInputSchema>;
export type CreateEmailReport = z.output<typeof emailReportInputSchema>;

export const updateEmailReportSchema = emailReportInputSchema.partial();
export type UpdateEmailReport = z.output<typeof updateEmailReportSchema>;

export const reportRunStatusSchema = z.enum(['queued', 'sent', 'skipped', 'failed']);
export type ReportRunStatus = z.infer<typeof reportRunStatusSchema>;

export const emailReportRunSchema = z.object({
  id: z.uuid(),
  trigger: z.enum(['schedule', 'manual']),
  status: reportRunStatusSchema,
  /** The local days the report covers (inclusive). */
  periodFrom: z.iso.date(),
  periodTo: z.iso.date(),
  leadCount: z.number().int().nullable(),
  recipients: z.array(z.string()),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  sentAt: z.iso.datetime().nullable(),
});
export type EmailReportRun = z.infer<typeof emailReportRunSchema>;

export const emailReportSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  recipients: z.array(z.string()),
  frequency: reportFrequencySchema,
  sendTime: z.string(),
  weekday: z.number().int(),
  timeZone: z.string(),
  grades: reportGradesSchema,
  agentId: z.uuid().nullable(),
  skipEmpty: z.boolean(),
  enabled: z.boolean(),
  /** When it goes out next (null while paused). */
  nextRunAt: z.iso.datetime().nullable(),
  lastRun: emailReportRunSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type EmailReport = z.infer<typeof emailReportSchema>;

export const emailReportListSchema = z.object({
  reports: z.array(emailReportSchema),
  /** False when the server has no SMTP settings: reports are kept but not sent. */
  emailConfigured: z.boolean(),
});
export type EmailReportList = z.infer<typeof emailReportListSchema>;

export const emailReportRunsSchema = z.object({ runs: z.array(emailReportRunSchema) });

/** Queue job: build and e-mail one report run (scheduled or "Send now"). */
export const REPORT_SEND_QUEUE = 'report-send';
export const reportSendJobSchema = z.object({
  tenantId: z.string().min(1),
  runId: z.uuid(),
});
export type ReportSendJob = z.infer<typeof reportSendJobSchema>;

/** SMTP hiccups are retried twice (1 and 2 minutes later), then the run is marked failed. */
export const REPORT_SEND_ATTEMPTS = 3;
export const REPORT_SEND_BACKOFF_MS = 60_000;
/** One job per run, so re-queuing a run whose job still exists is a no-op. */
export const reportSendJobId = (runId: string) => `report-run-${runId}`;

/** Every minute: find reports that are due and queue their runs. */
export const REPORT_TICK_QUEUE = 'report-tick';
