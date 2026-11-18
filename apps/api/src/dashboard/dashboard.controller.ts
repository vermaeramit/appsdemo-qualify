import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { missingRequiredFields } from '@qualify/core';
import {
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  getPlaybookVersion,
  phoneNumbers,
  sql,
  type Transaction,
  withTenant,
} from '@qualify/db';
import {
  type DashboardPeriod,
  dashboardPeriodSchema,
  type DashboardResponse,
  dashboardResponseSchema,
  type LeadSource,
  type PlaybookField,
} from '@qualify/shared';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { DB } from '../tokens';

/** Days before today that a period starts, and its length (for the previous-period window). */
const PERIODS: Record<DashboardPeriod, { offsetDays: number; spanDays: number }> = {
  today: { offsetDays: 0, spanDays: 1 },
  '7d': { offsetDays: 6, spanDays: 7 },
  '30d': { offsetDays: 29, spanDays: 30 },
};

const RECENT_LIMIT = 8;
const HIGHLIGHTS = 3;

/** A valid IANA time zone known to Node, or UTC. (Postgres support is checked in the query.) */
export function safeTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

/** Raw query timestamps arrive as Postgres strings; they go back into later queries as-is. */
type Boundaries = {
  from_ts: string;
  now_ts: string;
  prev_from: string;
  prev_to: string;
};

/**
 * Dashboard numbers for the active workspace, all from real data and scoped to one calendar
 * period in the viewer's time zone. Lead counts are cohorts: leads created in the period.
 */
@Controller('dashboard')
@UseGuards(WorkspaceGuard)
export class DashboardController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  async get(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query('period') periodParam: unknown,
    @Query('tz') tzParam: unknown,
  ): Promise<DashboardResponse> {
    const period = dashboardPeriodSchema.catch('today').parse(periodParam);
    const { offsetDays, spanDays } = PERIODS[period];

    return withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const tz = await this.postgresTimeZone(tx, safeTimeZone(tzParam));
      const localToday = sql`date_trunc('day', now() at time zone ${tz})`;
      const fromLocal = sql`(${localToday} - make_interval(days => ${offsetDays}))`;

      const [bounds] = (
        await tx.execute<Boundaries>(sql`
          select f as from_ts, now() as now_ts,
                 f - make_interval(days => ${spanDays}) as prev_from,
                 now() - make_interval(days => ${spanDays}) as prev_to
          from (select ${fromLocal} at time zone ${tz} as f) b`)
      ).rows;
      const { from_ts: from, prev_from: prevFrom, prev_to: prevTo } = bounds!;

      const [counts] = (
        await tx.execute<{
          new_leads: number;
          prev_leads: number;
          qualified: number;
          handoffs: number;
        }>(sql`
          select
            count(*) filter (where created_at >= ${from})::int as new_leads,
            count(*) filter (where created_at >= ${prevFrom} and created_at < ${prevTo})::int as prev_leads,
            count(*) filter (where created_at >= ${from} and qualified_at is not null)::int as qualified,
            count(*) filter (where created_at >= ${from} and handoff_at is not null)::int as handoffs
          from leads
          where created_at >= ${prevFrom}`)
      ).rows;

      // Reply time: from the lead's first message since our last outbound one, to the AI reply.
      const [reply] = (
        await tx.execute<{ median: number | null; samples: number }>(sql`
          select
            percentile_cont(0.5) within group (
              order by extract(epoch from (o.created_at - fu.first_unanswered))
            )::float8 as median,
            count(*)::int as samples
          from messages o
          cross join lateral (
            select min(i.created_at) as first_unanswered
            from messages i
            where i.lead_id = o.lead_id
              and i.direction = 'inbound'
              and i.type <> 'reaction'
              and i.created_at <= o.created_at
              and i.created_at > coalesce(
                (select max(p.created_at) from messages p
                 where p.lead_id = o.lead_id and p.direction = 'outbound'
                   and p.created_at < o.created_at),
                '-infinity'::timestamptz)
          ) fu
          where o.direction = 'outbound' and o.sender = 'ai' and o.status <> 'failed'
            and o.created_at >= ${from} and fu.first_unanswered is not null`)
      ).rows;

      const hourly = period === 'today';
      const series = (
        await tx.execute<{ bucket: string; leads: number; qualified: number }>(sql`
          select to_char(b, ${hourly ? 'YYYY-MM-DD"T"HH24' : 'YYYY-MM-DD'}) as bucket,
                 count(l.id)::int as leads,
                 count(l.id) filter (where l.qualified_at is not null)::int as qualified
          from generate_series(
                 ${fromLocal},
                 ${hourly ? sql`${localToday} + interval '23 hours'` : localToday},
                 ${hourly ? '1 hour' : '1 day'}::interval) as b
          left join leads l
            on l.created_at >= ${from}
           and date_trunc(${hourly ? 'hour' : 'day'}, l.created_at at time zone ${tz}) = b
          group by b
          order by b`)
      ).rows;

      const pipeline = (
        await tx.execute<{ status: string; count: number }>(sql`
          select status, count(*)::int as count from leads
          where created_at >= ${from} group by status order by count desc`)
      ).rows;
      const sources = (
        await tx.execute<{ source: LeadSource; count: number }>(sql`
          select source, count(*)::int as count from leads
          where created_at >= ${from} group by source order by count desc`)
      ).rows;

      const recentLeads = await this.recentLeads(tx, from);
      const [number] = await tx
        .select({
          displayPhone: phoneNumbers.displayPhone,
          displayName: phoneNumbers.displayName,
          qualityRating: phoneNumbers.qualityRating,
          isCoexistence: phoneNumbers.isCoexistence,
        })
        .from(phoneNumbers)
        .where(eq(phoneNumbers.status, 'active'))
        .limit(1);

      return dashboardResponseSchema.parse({
        period,
        timezone: tz,
        from: new Date(from).toISOString(),
        generatedAt: new Date(bounds!.now_ts).toISOString(),
        kpis: {
          newLeads: counts?.new_leads ?? 0,
          previousNewLeads: counts?.prev_leads ?? 0,
          qualified: counts?.qualified ?? 0,
          handoffs: counts?.handoffs ?? 0,
          medianReplySeconds: reply?.median ?? null,
          replySamples: reply?.samples ?? 0,
        },
        series,
        bucket: hourly ? 'hour' : 'day',
        pipeline,
        sources,
        recentLeads,
        whatsapp: number ?? null,
      });
    });
  }

  /** Node and Postgres ship separate zone databases; fall back to UTC if Postgres lacks it. */
  private async postgresTimeZone(tx: Transaction, tz: string): Promise<string> {
    if (tz === 'UTC') return tz;
    const { rows } = await tx.execute<{ known: boolean }>(
      sql`select exists(select 1 from pg_timezone_names where name = ${tz}) as known`,
    );
    return rows[0]?.known ? tz : 'UTC';
  }

  private async recentLeads(tx: Transaction, from: string) {
    const rows = (
      await tx.execute<{
        id: string;
        name: string | null;
        phone_e164: string;
        source: LeadSource;
        status: string;
        fields: Record<string, string>;
        playbook_version_id: string | null;
        last_activity: string;
      }>(sql`
        select id, name, phone_e164, source, status, fields, playbook_version_id,
               coalesce(last_message_at, created_at) as last_activity
        from leads
        where coalesce(last_message_at, created_at) >= ${from}
        order by last_activity desc
        limit ${RECENT_LIMIT}`)
    ).rows;

    // Progress is measured against the questions of the version each lead is on.
    const current = await getDefaultPublishedPlaybook(tx);
    const definitionsByVersion = new Map<string, PlaybookField[]>();
    for (const versionId of new Set(rows.map((row) => row.playbook_version_id))) {
      if (!versionId) continue;
      const version = await getPlaybookVersion(tx, versionId);
      if (version) definitionsByVersion.set(versionId, version.config.fields);
    }

    return rows.map((row) => {
      const definitions =
        (row.playbook_version_id && definitionsByVersion.get(row.playbook_version_id)) ||
        current?.config.fields ||
        [];
      const required = definitions.filter((field) => field.required);
      const ordered = [...definitions].sort((a, b) => a.priority - b.priority);
      return {
        id: row.id,
        name: row.name,
        phone: row.phone_e164,
        source: row.source,
        status: row.status,
        requiredAnswered: required.length - missingRequiredFields(definitions, row.fields).length,
        requiredTotal: required.length,
        highlights: ordered
          .filter((field) => row.fields[field.key])
          .slice(0, HIGHLIGHTS)
          .map((field) => ({ label: field.label, value: row.fields[field.key]! })),
        lastActivityAt: new Date(row.last_activity).toISOString(),
      };
    });
  }
}
