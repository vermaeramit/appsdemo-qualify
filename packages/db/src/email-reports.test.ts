// Integration test: scheduled e-mail reports (D-088) on real Postgres — schedule math in the
// report's time zone, periods, claiming due slots once, and the summary with an agent filter.
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { PlaybookConfig } from '@qualify/shared';
import { eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from './client.ts';
import {
  claimDueReport,
  createManualReportRun,
  nextReportRun,
  type ReportSchedule,
  reportPeriod,
} from './email-reports.ts';
import { summarizeLeads } from './lead-list.ts';
import { runMigrations } from './migrate.ts';
import { createPublishedPlaybook } from './playbooks.ts';
import { emailReportRuns, emailReports, leads, organization, tenants } from './schema/index.ts';
import { type Transaction, withTenant } from './tenant.ts';

const APP_PASSWORD = 'test_app_password';
const IST = 'Asia/Kolkata';
let container: StartedPostgreSqlContainer;
let app: DbHandle;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:17-alpine').start();
  const ownerUrl = container.getConnectionUri();
  const owner = new pg.Client({ connectionString: ownerUrl });
  await owner.connect();
  await owner.query(`CREATE ROLE qualify_app LOGIN PASSWORD '${APP_PASSWORD}'`);
  await owner.end();
  await runMigrations(ownerUrl);
  const seed = createDb(ownerUrl, { max: 1 });
  await seed.db
    .insert(organization)
    .values({ id: 'org_a', name: 'A', slug: 'a', createdAt: new Date() });
  await seed.db.insert(tenants).values({ id: 'org_a' });
  await seed.pool.end();
  const appUrl = new URL(ownerUrl);
  appUrl.username = 'qualify_app';
  appUrl.password = APP_PASSWORD;
  app = createDb(appUrl.toString(), { max: 2 });
}, 180_000);

afterAll(async () => {
  await app?.pool.end();
  await container?.stop();
});

const inTenant = <T>(fn: (tx: Transaction) => Promise<T>) => withTenant(app.db, 'org_a', fn);
const next = (schedule: ReportSchedule, after: string) =>
  inTenant((tx) => nextReportRun(tx, schedule, new Date(after))).then((d) => d.toISOString());
const period = (frequency: ReportSchedule['frequency'], at: string, soFar: boolean, tz = IST) =>
  inTenant((tx) => reportPeriod(tx, { frequency, timeZone: tz }, new Date(at), soFar));

describe('schedule math (next_email_report_run)', () => {
  const daily: ReportSchedule = {
    frequency: 'daily',
    weekday: 1,
    sendTime: '09:00',
    timeZone: IST,
  };

  it('daily: today at 09:00 local if still ahead, else tomorrow (strictly after)', async () => {
    expect(await next(daily, '2026-11-18T02:00:00Z')).toBe('2026-11-18T03:30:00.000Z');
    expect(await next(daily, '2026-11-18T03:30:00Z')).toBe('2026-11-19T03:30:00.000Z');
    expect(await next(daily, '2026-11-18T20:00:00Z')).toBe('2026-11-19T03:30:00.000Z');
  });

  it('weekly: the next chosen weekday (2026-11-18 is a Wednesday)', async () => {
    const monday = { ...daily, frequency: 'weekly' as const, weekday: 1 };
    expect(await next(monday, '2026-11-18T05:00:00Z')).toBe('2026-11-23T03:30:00.000Z');
    const wednesday = { ...daily, frequency: 'weekly' as const, weekday: 3 };
    expect(await next(wednesday, '2026-11-18T02:00:00Z')).toBe('2026-11-18T03:30:00.000Z');
    expect(await next(wednesday, '2026-11-18T04:00:00Z')).toBe('2026-11-25T03:30:00.000Z');
  });

  it('monthly: the 1st of the month', async () => {
    const monthly = { ...daily, frequency: 'monthly' as const };
    expect(await next(monthly, '2026-11-18T05:00:00Z')).toBe('2026-12-01T03:30:00.000Z');
    expect(await next(monthly, '2026-11-01T02:00:00Z')).toBe('2026-11-01T03:30:00.000Z');
  });

  it('follows daylight saving in the report time zone', async () => {
    const newYork = { ...daily, timeZone: 'America/New_York' };
    // 09:00 EDT (UTC-4) on Oct 31, then 09:00 EST (UTC-5) after the clocks go back on Nov 1.
    expect(await next(newYork, '2026-10-30T14:00:00Z')).toBe('2026-10-31T13:00:00.000Z');
    expect(await next(newYork, '2026-10-31T14:00:00Z')).toBe('2026-11-01T14:00:00.000Z');
  });
});

describe('report periods (email_report_period)', () => {
  it('a scheduled run covers the last full period before its day', async () => {
    expect(await period('daily', '2026-11-18T03:30:00Z', false)).toEqual({
      from: '2026-11-17',
      to: '2026-11-17',
    });
    expect(await period('weekly', '2026-11-23T03:30:00Z', false)).toEqual({
      from: '2026-11-16',
      to: '2026-11-22',
    });
    expect(await period('monthly', '2026-12-01T03:30:00Z', false)).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    });
  });

  it('"Send now" covers the current period so far, in local days', async () => {
    expect(await period('daily', '2026-11-18T10:00:00Z', true)).toEqual({
      from: '2026-11-18',
      to: '2026-11-18',
    });
    expect(await period('weekly', '2026-11-18T10:00:00Z', true)).toEqual({
      from: '2026-11-12',
      to: '2026-11-18',
    });
    expect(await period('monthly', '2026-11-18T10:00:00Z', true)).toEqual({
      from: '2026-11-01',
      to: '2026-11-18',
    });
    // 20:00 UTC is already the next day in India.
    expect(await period('daily', '2026-11-18T20:00:00Z', true)).toEqual({
      from: '2026-11-19',
      to: '2026-11-19',
    });
  });
});

describe('claiming due reports', () => {
  async function insertReport(nextRunAt: Date) {
    const [report] = await inTenant((tx) =>
      tx
        .insert(emailReports)
        .values({
          tenantId: 'org_a',
          name: 'Daily',
          recipients: ['sales@example.com'],
          frequency: 'daily',
          sendTime: '09:00',
          timeZone: IST,
          nextRunAt,
        })
        .returning(),
    );
    return report!;
  }

  it('claims the latest passed slot once after downtime and moves to the next future slot', async () => {
    const report = await insertReport(new Date(Date.now() - 3 * 86_400_000));
    const runId = await inTenant((tx) => claimDueReport(tx, report.id));
    expect(runId).toBeTruthy();
    // Not due any more: a second worker (or the next tick) gets nothing.
    expect(await inTenant((tx) => claimDueReport(tx, report.id))).toBeNull();

    const [run] = await inTenant((tx) =>
      tx.select().from(emailReportRuns).where(eq(emailReportRuns.id, runId!)),
    );
    const [after] = await inTenant((tx) =>
      tx.select().from(emailReports).where(eq(emailReports.id, report.id)),
    );
    const now = Date.now();
    expect(run!.trigger).toBe('schedule');
    expect(run!.status).toBe('queued');
    expect(run!.recipients).toEqual(['sales@example.com']);
    expect(run!.scheduledFor!.getTime()).toBeLessThanOrEqual(now);
    expect(after!.nextRunAt!.getTime()).toBeGreaterThan(now);
    expect(after!.nextRunAt!.getTime() - run!.scheduledFor!.getTime()).toBe(86_400_000);
    // The period is the local day before the slot's day.
    const [expected] = (
      await inTenant((tx) =>
        tx.execute<{ day: string }>(
          sql`select ((${run!.scheduledFor!.toISOString()}::timestamptz at time zone ${IST})::date - 1)::text as day`,
        ),
      )
    ).rows;
    expect(run!.periodFrom).toBe(expected!.day);
    expect(run!.periodTo).toBe(expected!.day);
  });

  it('ignores reports that are paused or not due yet', async () => {
    const future = await insertReport(new Date(Date.now() + 3_600_000));
    expect(await inTenant((tx) => claimDueReport(tx, future.id))).toBeNull();
    const paused = await insertReport(new Date(Date.now() - 60_000));
    await inTenant((tx) =>
      tx.update(emailReports).set({ enabled: false }).where(eq(emailReports.id, paused.id)),
    );
    expect(await inTenant((tx) => claimDueReport(tx, paused.id))).toBeNull();
  });

  it('"Send now" queues a manual run for today so far', async () => {
    const report = await insertReport(new Date(Date.now() + 3_600_000));
    const runId = await inTenant((tx) => createManualReportRun(tx, report.id));
    const [run] = await inTenant((tx) =>
      tx.select().from(emailReportRuns).where(eq(emailReportRuns.id, runId!)),
    );
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date());
    expect(run).toMatchObject({ trigger: 'manual', scheduledFor: null, status: 'queued' });
    expect(run!.periodFrom).toBe(today);
    expect(run!.periodTo).toBe(today);
  });
});

describe('summarizeLeads with an agent filter', () => {
  it('counts grades for one agent; the default agent also owns unpinned leads', async () => {
    const config = { persona: { name: 'x' } } as unknown as PlaybookConfig;
    const main = await inTenant((tx) =>
      createPublishedPlaybook(tx, {
        tenantId: 'org_a',
        name: 'Main',
        templateKey: null,
        config,
        isDefault: true,
      }),
    );
    const premium = await inTenant((tx) =>
      createPublishedPlaybook(tx, {
        tenantId: 'org_a',
        name: 'Premium',
        templateKey: null,
        config,
        isDefault: false,
      }),
    );
    const at = new Date('2026-11-17T06:00:00Z');
    await inTenant((tx) =>
      tx.insert(leads).values([
        {
          tenantId: 'org_a',
          phoneE164: '+919800001001',
          source: 'api',
          grade: 'hot',
          qualifiedAt: at,
          playbookVersionId: premium!.versionId,
          createdAt: at,
        },
        {
          tenantId: 'org_a',
          phoneE164: '+919800001002',
          source: 'api',
          grade: 'cold',
          playbookVersionId: main!.versionId,
          createdAt: at,
        },
        { tenantId: 'org_a', phoneE164: '+919800001003', source: 'api', createdAt: at },
      ]),
    );
    const day = { timeZone: IST, from: '2026-11-17', to: '2026-11-17' };
    const all = await inTenant((tx) => summarizeLeads(tx, day));
    expect(all).toMatchObject({ total: 3, hot: 1, cold: 1, unscored: 1, qualified: 1 });
    const onlyPremium = await inTenant((tx) =>
      summarizeLeads(tx, { ...day, agent: { id: premium!.playbookId, includeUnpinned: false } }),
    );
    expect(onlyPremium).toMatchObject({ total: 1, hot: 1 });
    const onlyMain = await inTenant((tx) =>
      summarizeLeads(tx, { ...day, agent: { id: main!.playbookId, includeUnpinned: true } }),
    );
    expect(onlyMain).toMatchObject({ total: 2, cold: 1, unscored: 1 });
    const hotOnly = await inTenant((tx) => summarizeLeads(tx, { ...day, grades: ['hot'] }));
    expect(hotOnly.total).toBe(1);
  });
});
