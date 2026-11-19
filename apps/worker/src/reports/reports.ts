// Scheduled e-mail reports (FR-8.2, D-088). A minute tick claims due report slots and queues a
// send job per run; the send job gathers the period's leads, attaches them as Excel and e-mails
// a summary. Postgres owns the schedule (next_run_at), so nothing is lost if Redis restarts.
import { renderReportEmail, type ReportLeadLine } from '@qualify/core';
import {
  claimDueReport,
  conversationUrl,
  currentAgentConfigs,
  type Database,
  dueEmailReportWork,
  getLatestPublishedVersion,
  type LeadListFilters,
  type LeadListKey,
  type LeadListRow,
  leadSheetCells,
  leadSheetColumns,
  listLeads,
  originOf,
  sheetQuestions,
  sql,
  summarizeLeads,
  withTenant,
} from '@qualify/db';
import type { Mailer } from '@qualify/integrations';
import type { PlaybookField, ReportSendJob } from '@qualify/shared';
import ExcelJS from 'exceljs';
import type { Logger } from '../logger.ts';

/** An e-mailed Excel stops here; the e-mail says so and links to the dashboard. */
export const REPORT_MAX_ROWS = 10_000;
const PAGE = 1_000;
const TOP_LEADS = 8;
export { REPORT_SEND_ATTEMPTS, REPORT_SEND_BACKOFF_MS } from '@qualify/shared';

const GRADE_WORDS: Record<string, string> = {
  hot: 'Hot',
  warm: 'Warm',
  cold: 'Cold',
  disqualified: 'Not a fit',
  none: 'Not scored',
};

/** Thrown to let BullMQ retry a failed send (SMTP down, timeout). */
export class ReportRetryError extends Error {}

export interface ReportDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Null when SMTP_URL isn't set: runs are marked failed with a clear message. */
  mailer: Mailer | null;
  appBaseUrl: string;
  productName: string;
}

/** Claims every due report slot (and re-queues runs whose job was lost). */
export async function processReportTick(
  deps: Pick<ReportDeps, 'db' | 'logger'> & {
    enqueueSend: (job: ReportSendJob) => Promise<void>;
  },
): Promise<{ queued: number }> {
  const work = await dueEmailReportWork(deps.db, 50);
  let queued = 0;
  for (const item of work) {
    try {
      const runId =
        item.kind === 'run'
          ? item.id
          : await withTenant(deps.db, item.tenantId, (tx) => claimDueReport(tx, item.id));
      if (!runId) continue;
      await deps.enqueueSend({ tenantId: item.tenantId, runId });
      queued += 1;
    } catch (error) {
      deps.logger.error({ err: error, ...item }, 'Could not queue a report run');
    }
  }
  return { queued };
}

type RunRow = {
  id: string;
  period_from: string;
  period_to: string;
  recipients: string[];
  report_name: string;
  grades: string[];
  agent_id: string | null;
  agent_name: string | null;
  agent_is_default: boolean | null;
  skip_empty: boolean;
  time_zone: string;
  workspace_name: string;
};

/** "Hot and Warm leads · Premium projects agent", or null for every lead. */
function scopeText(run: RunRow): string | null {
  const parts: string[] = [];
  if (run.grades.length) {
    const words = run.grades.map((grade) => GRADE_WORDS[grade] ?? grade);
    const list =
      words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0];
    parts.push(`${list} leads`);
  }
  if (run.agent_name) parts.push(`${run.agent_name} agent`);
  return parts.length ? parts.join(' · ') : null;
}

const excelName = (from: string, to: string) =>
  from === to ? `leads-${from}.xlsx` : `leads-${from}-to-${to}.xlsx`;

async function markRun(
  deps: Pick<ReportDeps, 'db'>,
  job: ReportSendJob,
  values: {
    status: 'sent' | 'skipped' | 'failed';
    leadCount?: number | null;
    error?: string | null;
    messageId?: string | null;
  },
): Promise<void> {
  await withTenant(deps.db, job.tenantId, (tx) =>
    tx.execute(sql`
      update email_report_runs
      set status = ${values.status},
          lead_count = coalesce(${values.leadCount ?? null}::int, lead_count),
          error = ${values.error ?? null},
          message_id = ${values.messageId ?? null},
          sent_at = case when ${values.status} = 'sent' then now() else sent_at end
      where id = ${job.runId} and status = 'queued'`),
  );
}

/** Builds and e-mails one report run. */
export async function processReportSend(
  job: ReportSendJob,
  attempt: { attemptsMade: number; maxAttempts: number },
  deps: ReportDeps,
): Promise<'sent' | 'skipped' | 'failed' | 'gone'> {
  const run = await withTenant(deps.db, job.tenantId, async (tx) => {
    const [row] = (
      await tx.execute<RunRow>(sql`
        select q.id, q.period_from::text, q.period_to::text, q.recipients, r.name as report_name,
               r.grades, r.agent_id, p.name as agent_name, p.is_default as agent_is_default,
               r.skip_empty, r.time_zone, o.name as workspace_name
        from email_report_runs q
        join email_reports r on r.id = q.report_id
        left join playbooks p on p.id = r.agent_id
        join organization o on o.id = q.tenant_id
        where q.id = ${job.runId} and q.status = 'queued'`)
    ).rows;
    return row ?? null;
  });
  if (!run) return 'gone';
  if (!deps.mailer) {
    await markRun(deps, job, {
      status: 'failed',
      error: 'E-mail sending is not set up on the server (SMTP_URL).',
    });
    return 'failed';
  }

  const filters: LeadListFilters = {
    timeZone: run.time_zone,
    from: run.period_from,
    to: run.period_to,
    grades: run.grades,
    agent: run.agent_id
      ? { id: run.agent_id, includeUnpinned: run.agent_is_default === true }
      : undefined,
  };
  const { summary, top, questions } = await withTenant(deps.db, job.tenantId, async (tx) => {
    const summary = await summarizeLeads(tx, filters);
    const top = summary.total
      ? (await listLeads(tx, { ...filters, sort: 'score', limit: TOP_LEADS, withTotal: false }))
          .rows
      : [];
    const agentConfig = run.agent_id
      ? (await getLatestPublishedVersion(tx, run.agent_id))?.config
      : undefined;
    const questions: PlaybookField[] = sheetQuestions(
      agentConfig ? [agentConfig] : await currentAgentConfigs(tx),
    );
    return { summary, top, questions };
  });

  if (summary.total === 0 && run.skip_empty) {
    await markRun(deps, job, { status: 'skipped', leadCount: 0 });
    return 'skipped';
  }

  let attachment: { content: Buffer; rows: number; capped: boolean } | null = null;
  if (summary.total > 0) {
    const rows: LeadListRow[] = [];
    let after: LeadListKey | null = null;
    do {
      const page = await withTenant(deps.db, job.tenantId, (tx) =>
        listLeads(tx, { ...filters, sort: 'newest', limit: PAGE, after, withTotal: false }),
      );
      rows.push(...page.rows.slice(0, REPORT_MAX_ROWS - rows.length));
      after = rows.length < REPORT_MAX_ROWS ? page.next : null;
    } while (after);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = deps.productName;
    const sheet = workbook.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = leadSheetColumns(questions);
    sheet.getRow(1).font = { bold: true };
    for (const row of rows) {
      sheet.addRow(
        leadSheetCells(row, questions, { timeZone: run.time_zone, appBaseUrl: deps.appBaseUrl }),
      );
    }
    attachment = {
      content: Buffer.from(await workbook.xlsx.writeBuffer()),
      rows: rows.length,
      capped: summary.total > rows.length,
    };
  }

  const base = deps.appBaseUrl.replace(/\/$/, '');
  const leadsQuery = new URLSearchParams({ from: run.period_from, to: run.period_to });
  if (run.grades.length) leadsQuery.set('grade', run.grades.join(','));
  const topLeads: ReportLeadLine[] = top.map((lead) => ({
    name: lead.name,
    phone: lead.phone,
    grade: lead.grade,
    score: lead.score,
    note: lead.summary ?? lead.scoreDetails?.reason ?? null,
    origin: originOf(lead.attribution),
    url: conversationUrl(deps.appBaseUrl, lead.id),
  }));
  const email = renderReportEmail({
    productName: deps.productName,
    workspaceName: run.workspace_name,
    reportName: run.report_name,
    period: { from: run.period_from, to: run.period_to },
    scope: scopeText(run),
    summary,
    topLeads,
    leadsUrl: `${base}/leads?${leadsQuery.toString()}`,
    attachment: attachment ? { rows: attachment.rows, capped: attachment.capped } : null,
  });

  try {
    const sent = await deps.mailer.send({
      to: run.recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
      attachments: attachment
        ? [
            {
              filename: excelName(run.period_from, run.period_to),
              content: attachment.content,
              contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            },
          ]
        : [],
    });
    await markRun(deps, job, {
      status: 'sent',
      leadCount: summary.total,
      messageId: sent.messageId,
    });
    return 'sent';
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    if (attempt.attemptsMade + 1 < attempt.maxAttempts) {
      deps.logger.warn({ runId: job.runId, err: error }, 'Report e-mail failed, retrying');
      throw new ReportRetryError(message);
    }
    await markRun(deps, job, { status: 'failed', leadCount: summary.total, error: message });
    return 'failed';
  }
}
