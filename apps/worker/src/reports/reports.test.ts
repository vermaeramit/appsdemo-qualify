// Integration test: scheduled e-mail reports (D-088) — tick claims due slots once, the send job
// e-mails a summary with the period's leads as Excel, and records the outcome (real Postgres).
import { randomBytes } from 'node:crypto';
import {
  createManualReportRun,
  createPublishedPlaybook,
  emailReportRuns,
  emailReports,
  eq,
  leads,
  withTenant,
} from '@qualify/db';
import type { Mailer, OutgoingEmail } from '@qualify/integrations';
import type { PlaybookConfig, ReportSendJob } from '@qualify/shared';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { startTestDb, TENANT, type TestDb } from '../test/test-db.ts';
import { processReportSend, processReportTick, ReportRetryError } from './reports.ts';

let testDb: TestDb;
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const sent: OutgoingEmail[] = [];
let failNext = false;
const mailer: Mailer = {
  async send(email) {
    if (failNext) throw new Error('SMTP 421 try again later');
    sent.push(email);
    return { messageId: `<${sent.length}@test>` };
  },
};
const deps = () => ({
  db: testDb.app.db,
  logger,
  mailer: async () => mailer,
  appBaseUrl: 'https://qualify.example.com',
  productName: 'AppsDemo Qualify',
});
const once = { attemptsMade: 0, maxAttempts: 3 };
const last = { attemptsMade: 2, maxAttempts: 3 };

beforeAll(async () => {
  testDb = await startTestDb(randomBytes(32));
  // Leads created now fall in "today so far" (manual runs) in India.
  await withTenant(testDb.app.db, TENANT, (tx) =>
    tx.insert(leads).values([
      {
        tenantId: TENANT,
        phoneE164: '+919800002001',
        name: 'Neha',
        source: 'meta_form',
        status: 'qualified',
        grade: 'hot',
        score: 88,
        summary: 'Wants a 5-night Goa trip in December.',
        fields: { destination: 'Goa' },
        playbookVersionId: testDb.playbookVersionId,
      },
      {
        tenantId: TENANT,
        phoneE164: '+919800002002',
        name: 'Arjun',
        source: 'api',
        status: 'engaged',
        grade: 'cold',
        score: 22,
        playbookVersionId: testDb.playbookVersionId,
      },
    ]),
  );
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  sent.length = 0;
  failNext = false;
});

async function createReport(values: Partial<typeof emailReports.$inferInsert> = {}) {
  const [report] = await withTenant(testDb.app.db, TENANT, (tx) =>
    tx
      .insert(emailReports)
      .values({
        tenantId: TENANT,
        name: 'Daily leads',
        recipients: ['sales@example.com', 'owner@example.com'],
        frequency: 'daily',
        sendTime: '09:00',
        timeZone: 'Asia/Kolkata',
        nextRunAt: new Date(Date.now() + 3_600_000),
        ...values,
      })
      .returning(),
  );
  return report!;
}

async function manualRun(reportId: string): Promise<ReportSendJob> {
  const runId = await withTenant(testDb.app.db, TENANT, (tx) =>
    createManualReportRun(tx, reportId),
  );
  return { tenantId: TENANT, runId: runId! };
}

const runRow = async (runId: string) =>
  (
    await withTenant(testDb.app.db, TENANT, (tx) =>
      tx.select().from(emailReportRuns).where(eq(emailReportRuns.id, runId)),
    )
  )[0]!;

describe('report tick', () => {
  it('queues one run per due report and nothing on the next tick', async () => {
    const report = await createReport({ nextRunAt: new Date(Date.now() - 60_000) });
    const queued: ReportSendJob[] = [];
    const enqueueSend = async (job: ReportSendJob) => {
      queued.push(job);
    };
    await processReportTick({ db: testDb.app.db, logger, enqueueSend });
    expect(queued).toHaveLength(1);
    expect(await runRow(queued[0]!.runId)).toMatchObject({
      reportId: report.id,
      trigger: 'schedule',
      status: 'queued',
    });
    queued.length = 0;
    await processReportTick({ db: testDb.app.db, logger, enqueueSend });
    expect(queued).toHaveLength(0);
  });
});

describe('report send', () => {
  it('e-mails the summary with every lead of the period as Excel', async () => {
    const report = await createReport();
    const job = await manualRun(report.id);
    expect(await processReportSend(job, once, deps())).toBe('sent');

    expect(sent).toHaveLength(1);
    const email = sent[0]!;
    expect(email.to).toEqual(['sales@example.com', 'owner@example.com']);
    expect(email.subject).toMatch(/^Daily leads: 2 new leads, 1 Hot · /);
    expect(email.html).toContain('Sunrise Holidays');
    expect(email.html).toContain('Wants a 5-night Goa trip in December.');
    expect(email.html).toContain('https://qualify.example.com/conversations?lead=');
    expect(email.attachments).toHaveLength(1);
    const file = email.attachments![0]!;
    expect(file.filename).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.content as unknown as ArrayBuffer);
    const sheet = workbook.getWorksheet('Leads')!;
    expect(sheet.rowCount).toBe(3); // header + 2 leads
    const header = (sheet.getRow(1).values as unknown[]).filter(Boolean);
    expect(header).toContain('Destination');
    expect(header).toContain('Why this score');

    const run = await runRow(job.runId);
    expect(run).toMatchObject({ status: 'sent', leadCount: 2, error: null });
    expect(run.sentAt).toBeInstanceOf(Date);
    // A run is sent once: a duplicate job finds nothing to do.
    expect(await processReportSend(job, once, deps())).toBe('gone');
  });

  it('applies the grade filter to the summary and the file', async () => {
    const report = await createReport({ grades: ['hot'] });
    const job = await manualRun(report.id);
    await processReportSend(job, once, deps());
    expect(sent[0]!.subject).toMatch(/1 new lead, 1 Hot/);
    expect(sent[0]!.html).toContain('Hot leads');
    expect(sent[0]!.html).not.toContain('Arjun');
  });

  it("covers one agent's leads only", async () => {
    const premium = await withTenant(testDb.app.db, TENANT, (tx) =>
      createPublishedPlaybook(tx, {
        tenantId: TENANT,
        name: 'Premium',
        templateKey: null,
        config: { persona: { name: 'x' }, fields: [] } as unknown as PlaybookConfig,
        isDefault: false,
      }),
    );
    const report = await createReport({ agentId: premium!.playbookId, skipEmpty: false });
    const job = await manualRun(report.id);
    expect(await processReportSend(job, once, deps())).toBe('sent');
    expect(sent[0]!.subject).toMatch(/no new leads/);
    expect(sent[0]!.html).toContain('Premium agent');
    expect(sent[0]!.attachments).toEqual([]);
  });

  it('skips an empty period when asked to', async () => {
    const premium = await withTenant(testDb.app.db, TENANT, (tx) =>
      createPublishedPlaybook(tx, {
        tenantId: TENANT,
        name: 'Empty',
        templateKey: null,
        config: { persona: { name: 'x' }, fields: [] } as unknown as PlaybookConfig,
        isDefault: false,
      }),
    );
    const report = await createReport({ agentId: premium!.playbookId, skipEmpty: true });
    const job = await manualRun(report.id);
    expect(await processReportSend(job, once, deps())).toBe('skipped');
    expect(sent).toHaveLength(0);
    expect(await runRow(job.runId)).toMatchObject({ status: 'skipped', leadCount: 0 });
  });

  it('retries a failed send, then records the error on the last attempt', async () => {
    const report = await createReport();
    const job = await manualRun(report.id);
    failNext = true;
    await expect(processReportSend(job, once, deps())).rejects.toBeInstanceOf(ReportRetryError);
    expect((await runRow(job.runId)).status).toBe('queued');
    expect(await processReportSend(job, last, deps())).toBe('failed');
    expect(await runRow(job.runId)).toMatchObject({
      status: 'failed',
      error: 'SMTP 421 try again later',
    });
  });

  it('fails clearly when e-mail is not set up', async () => {
    const report = await createReport();
    const job = await manualRun(report.id);
    expect(await processReportSend(job, once, { ...deps(), mailer: async () => null })).toBe(
      'failed',
    );
    expect((await runRow(job.runId)).error).toMatch(/SMTP_URL/);
  });
});
