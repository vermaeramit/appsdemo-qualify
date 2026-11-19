import { sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import type { Transaction } from './tenant.ts';

/** The schedule columns of a report (see `next_email_report_run` in migration 0027). */
export interface ReportSchedule {
  frequency: 'daily' | 'weekly' | 'monthly';
  weekday: number;
  sendTime: string;
  timeZone: string;
}

/** The next send time strictly after `after` (default: now), in the report's time zone. */
export async function nextReportRun(
  tx: Transaction,
  schedule: ReportSchedule,
  after?: Date,
): Promise<Date> {
  const [row] = (
    await tx.execute<{ next: string }>(sql`
      select next_email_report_run(${schedule.frequency}, ${schedule.weekday}, ${schedule.sendTime},
                                   ${schedule.timeZone}, coalesce(${after?.toISOString() ?? null}::timestamptz, now()))::text as next`)
  ).rows;
  return new Date(row!.next);
}

/** The local days (inclusive) a run covers; `soFar` = "Send now" (the current period so far). */
export async function reportPeriod(
  tx: Transaction,
  schedule: Pick<ReportSchedule, 'frequency' | 'timeZone'>,
  at: Date | null,
  soFar: boolean,
): Promise<{ from: string; to: string }> {
  const [row] = (
    await tx.execute<{ period_from: string; period_to: string }>(sql`
      select period_from::text, period_to::text
      from email_report_period(${schedule.frequency}, ${schedule.timeZone},
                               coalesce(${at?.toISOString() ?? null}::timestamptz, now()), ${soFar})`)
  ).rows;
  return { from: row!.period_from, to: row!.period_to };
}

export interface DueReportWork {
  kind: 'report' | 'run';
  tenantId: string;
  id: string;
}

/**
 * Reports whose next run is due, and runs left queued for over 10 minutes (their job was lost),
 * across tenants. Uses the narrow SECURITY DEFINER function from migration 0027: the caller sees
 * ids only and reads everything else inside withTenant().
 */
export async function dueEmailReportWork(db: Database, limit = 50): Promise<DueReportWork[]> {
  const { rows } = await db.execute<{ kind: 'report' | 'run'; tenant_id: string; id: string }>(
    sql`select kind, tenant_id, id from due_email_report_work(${limit})`,
  );
  return rows.map((row) => ({ kind: row.kind, tenantId: row.tenant_id, id: row.id }));
}

type ScheduleRow = {
  frequency: ReportSchedule['frequency'];
  weekday: number;
  send_time: string;
  time_zone: string;
  recipients: string[];
  next_run_at: string;
  now: string;
};

/**
 * Claims a due report's slot: records a queued run for the latest slot that has passed (one
 * catch-up run after downtime, not one per missed slot) and moves `next_run_at` to the next
 * future slot. Returns the run id, or null if another worker got it or it isn't due. Run in
 * withTenant().
 */
export async function claimDueReport(tx: Transaction, reportId: string): Promise<string | null> {
  const [report] = (
    await tx.execute<ScheduleRow>(sql`
      select frequency, weekday, send_time, time_zone, recipients, next_run_at::text, now()::text as now
      from email_reports
      where id = ${reportId} and enabled and next_run_at <= now()
      for update skip locked`)
  ).rows;
  if (!report) return null;
  const schedule: ReportSchedule = {
    frequency: report.frequency,
    weekday: report.weekday,
    sendTime: report.send_time,
    timeZone: report.time_zone,
  };
  const now = new Date(report.now);
  let slot = new Date(report.next_run_at);
  let following = await nextReportRun(tx, schedule, slot);
  // After downtime, report on the latest slot that has passed (bounded: about a year of days).
  for (let step = 0; following <= now && step < 400; step += 1) {
    slot = following;
    following = await nextReportRun(tx, schedule, slot);
  }
  const period = await reportPeriod(tx, schedule, slot, false);
  const [run] = (
    await tx.execute<{ id: string }>(sql`
      insert into email_report_runs
        (tenant_id, report_id, trigger, scheduled_for, period_from, period_to, recipients)
      values (current_setting('app.tenant_id'), ${reportId}, 'schedule', ${slot.toISOString()}::timestamptz,
              ${period.from}::date, ${period.to}::date, ${JSON.stringify(report.recipients)}::jsonb)
      on conflict (report_id, scheduled_for) where scheduled_for is not null do nothing
      returning id`)
  ).rows;
  await tx.execute(
    sql`update email_reports set next_run_at = ${following.toISOString()}::timestamptz where id = ${reportId}`,
  );
  return run?.id ?? null;
}

/** "Send now": a queued run for the current period so far. Run in withTenant(). */
export async function createManualReportRun(
  tx: Transaction,
  reportId: string,
): Promise<string | null> {
  const [report] = (
    await tx.execute<Omit<ScheduleRow, 'now' | 'next_run_at'>>(sql`
      select frequency, weekday, send_time, time_zone, recipients from email_reports where id = ${reportId}`)
  ).rows;
  if (!report) return null;
  const period = await reportPeriod(
    tx,
    { frequency: report.frequency, timeZone: report.time_zone },
    null,
    true,
  );
  const [run] = (
    await tx.execute<{ id: string }>(sql`
      insert into email_report_runs (tenant_id, report_id, trigger, period_from, period_to, recipients)
      values (current_setting('app.tenant_id'), ${reportId}, 'manual', ${period.from}::date,
              ${period.to}::date, ${JSON.stringify(report.recipients)}::jsonb)
      returning id`)
  ).rows;
  return run?.id ?? null;
}
