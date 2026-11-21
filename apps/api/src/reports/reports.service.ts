import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  and,
  auditLogs,
  createManualReportRun,
  type DbHandle,
  desc,
  emailReportRuns,
  emailReports,
  eq,
  nextReportRun,
  playbooks,
  sql,
  type Transaction,
  withTenant,
} from '@qualify/db';
import {
  type CreateEmailReport,
  type EmailReport,
  type EmailReportList,
  type EmailReportRun,
  emailReportListSchema,
  emailReportRunSchema,
  emailReportSchema,
  REPORT_SEND_ATTEMPTS,
  REPORT_SEND_BACKOFF_MS,
  type ReportSendJob,
  reportSendJobId,
  type UpdateEmailReport,
} from '@qualify/shared';
import type { Queue } from 'bullmq';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { postgresTimeZone } from '../common/time-zone';
import type { Env } from '../config/env';
import { REPORT_SEND_QUEUE_TOKEN } from '../queue/queue.module';
import { EmailSettingsService } from '../admin/email-settings.service';
import { DB, ENV } from '../tokens';

/** A workspace keeps a handful of reports; more is a sign of misuse. */
const MAX_REPORTS = 20;
const RUNS_SHOWN = 20;

type ReportRow = typeof emailReports.$inferSelect;
type RunRow = typeof emailReportRuns.$inferSelect;

function toRun(row: RunRow): EmailReportRun {
  return emailReportRunSchema.parse({
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    leadCount: row.leadCount,
    recipients: row.recipients,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  });
}

function toReport(row: ReportRow, lastRun: RunRow | undefined): EmailReport {
  return emailReportSchema.parse({
    id: row.id,
    name: row.name,
    recipients: row.recipients,
    frequency: row.frequency,
    sendTime: row.sendTime,
    weekday: row.weekday,
    timeZone: row.timeZone,
    grades: row.grades,
    agentId: row.agentId,
    skipEmpty: row.skipEmpty,
    enabled: row.enabled,
    nextRunAt: row.enabled ? (row.nextRunAt?.toISOString() ?? null) : null,
    lastRun: lastRun ? toRun(lastRun) : null,
    createdAt: row.createdAt.toISOString(),
  });
}

/** Scheduled e-mail reports of a workspace (FR-8.2, D-088). The worker sends them. */
@Injectable()
export class ReportsService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(REPORT_SEND_QUEUE_TOKEN) private readonly sendQueue: Queue<ReportSendJob>,
    @Inject(EmailSettingsService) private readonly email: EmailSettingsService,
  ) {}

  async list(workspace: WorkspaceContext): Promise<EmailReportList> {
    const reports = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const rows = await tx.select().from(emailReports).orderBy(emailReports.createdAt);
      const lastRuns = rows.length
        ? await tx
            .selectDistinctOn([emailReportRuns.reportId])
            .from(emailReportRuns)
            .orderBy(emailReportRuns.reportId, desc(emailReportRuns.createdAt))
        : [];
      return rows.map((row) =>
        toReport(
          row,
          lastRuns.find((run) => run.reportId === row.id),
        ),
      );
    });
    return emailReportListSchema.parse({
      reports,
      emailConfigured: await this.email.isConfigured(),
    });
  }

  async create(workspace: WorkspaceContext, input: CreateEmailReport): Promise<EmailReport> {
    return withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [{ count } = { count: 0 }] = (
        await tx.execute<{ count: number }>(sql`select count(*)::int as count from email_reports`)
      ).rows;
      if (count >= MAX_REPORTS) {
        throw new ConflictException(`A workspace can have up to ${MAX_REPORTS} reports`);
      }
      const timeZone = await this.checkTimeZone(tx, input.timeZone);
      await this.checkAgent(tx, input.agentId);
      const schedule = { ...input, timeZone };
      const [row] = await tx
        .insert(emailReports)
        .values({
          tenantId: workspace.tenantId,
          name: input.name,
          recipients: input.recipients,
          frequency: input.frequency,
          sendTime: input.sendTime,
          weekday: input.weekday,
          timeZone,
          grades: input.grades,
          agentId: input.agentId,
          skipEmpty: input.skipEmpty,
          enabled: input.enabled,
          nextRunAt: input.enabled ? await nextReportRun(tx, schedule) : null,
        })
        .returning();
      await this.audit(tx, workspace, 'report.created', row!.id, {
        name: input.name,
        frequency: input.frequency,
        recipients: input.recipients.length,
      });
      return toReport(row!, undefined);
    });
  }

  async update(
    workspace: WorkspaceContext,
    id: string,
    input: UpdateEmailReport,
  ): Promise<EmailReport> {
    return withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const current = await this.find(tx, id);
      const timeZone =
        input.timeZone !== undefined
          ? await this.checkTimeZone(tx, input.timeZone)
          : current.timeZone;
      if (input.agentId !== undefined) await this.checkAgent(tx, input.agentId);
      const merged = {
        frequency: input.frequency ?? current.frequency,
        weekday: input.weekday ?? current.weekday,
        sendTime: input.sendTime ?? current.sendTime,
        timeZone,
        enabled: input.enabled ?? current.enabled,
      };
      const [row] = await tx
        .update(emailReports)
        .set({
          ...input,
          timeZone,
          // Any change re-plans the next send from now (or stops it while paused).
          nextRunAt: merged.enabled ? await nextReportRun(tx, merged) : null,
        })
        .where(eq(emailReports.id, id))
        .returning();
      await this.audit(tx, workspace, 'report.updated', id, { fields: Object.keys(input) });
      const [lastRun] = await tx
        .select()
        .from(emailReportRuns)
        .where(eq(emailReportRuns.reportId, id))
        .orderBy(desc(emailReportRuns.createdAt))
        .limit(1);
      return toReport(row!, lastRun);
    });
  }

  async remove(workspace: WorkspaceContext, id: string): Promise<void> {
    await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const current = await this.find(tx, id);
      await tx.delete(emailReports).where(eq(emailReports.id, id));
      await this.audit(tx, workspace, 'report.deleted', id, { name: current.name });
    });
  }

  /** "Send now": the current period so far, e-mailed by the worker within seconds. */
  async sendNow(workspace: WorkspaceContext, id: string): Promise<EmailReportRun> {
    if (!(await this.email.isConfigured())) {
      throw new BadRequestException('E-mail sending is not set up (Platform admin → Email)');
    }
    const run = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      await this.find(tx, id);
      const runId = await createManualReportRun(tx, id);
      await this.audit(tx, workspace, 'report.sent_manually', id, {});
      const [row] = await tx.select().from(emailReportRuns).where(eq(emailReportRuns.id, runId!));
      return row!;
    });
    await this.sendQueue.add(
      'send',
      { tenantId: workspace.tenantId, runId: run.id },
      {
        jobId: reportSendJobId(run.id),
        attempts: REPORT_SEND_ATTEMPTS,
        backoff: { type: 'exponential', delay: REPORT_SEND_BACKOFF_MS },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return toRun(run);
  }

  async runs(workspace: WorkspaceContext, id: string): Promise<{ runs: EmailReportRun[] }> {
    const rows = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      await this.find(tx, id);
      return tx
        .select()
        .from(emailReportRuns)
        .where(and(eq(emailReportRuns.reportId, id)))
        .orderBy(desc(emailReportRuns.createdAt), desc(emailReportRuns.id))
        .limit(RUNS_SHOWN);
    });
    return { runs: rows.map(toRun) };
  }

  private async find(tx: Transaction, id: string): Promise<ReportRow> {
    const [row] = await tx.select().from(emailReports).where(eq(emailReports.id, id));
    if (!row) throw new NotFoundException('Report not found');
    return row;
  }

  private async checkTimeZone(tx: Transaction, value: string): Promise<string> {
    const timeZone = await postgresTimeZone(tx, value);
    if (timeZone !== value) throw new BadRequestException(`Unknown time zone "${value}"`);
    return timeZone;
  }

  private async checkAgent(tx: Transaction, agentId: string | null): Promise<void> {
    if (!agentId) return;
    const [agent] = await tx
      .select({ id: playbooks.id })
      .from(playbooks)
      .where(eq(playbooks.id, agentId));
    if (!agent) throw new BadRequestException('That agent no longer exists');
  }

  private async audit(
    tx: Transaction,
    workspace: WorkspaceContext,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: workspace.tenantId,
      actorUserId: workspace.userId,
      action,
      target,
      metadata,
    });
  }
}
