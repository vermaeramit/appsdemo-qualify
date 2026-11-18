import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { AI_PRICES_AS_OF, aiCostUsd } from '@qualify/core';
import { type DbHandle, sql, type Transaction, withTenant } from '@qualify/db';
import { MetaApiError, type PricingAnalyticsPoint } from '@qualify/integrations';
import {
  type CostPeriod,
  costPeriodSchema,
  type CostsResponse,
  costsResponseSchema,
} from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { localDay, postgresTimeZone } from '../common/time-zone';
import { DB } from '../tokens';
import { WhatsAppAccessService } from '../whatsapp/whatsapp-access.service';

const BILLABLE_LIMIT = 50;

/** Local-time start and end of each period (end is exclusive). */
const PERIOD_SQL: Record<CostPeriod, { from: string; to: string }> = {
  month: { from: `date_trunc('month', LOCAL_NOW)`, to: 'LOCAL_NOW' },
  last_month: {
    from: `date_trunc('month', LOCAL_NOW) - interval '1 month'`,
    to: `date_trunc('month', LOCAL_NOW)`,
  },
  '7d': { from: `date_trunc('day', LOCAL_NOW) - interval '6 days'`, to: 'LOCAL_NOW' },
  '30d': { from: `date_trunc('day', LOCAL_NOW) - interval '29 days'`, to: 'LOCAL_NOW' },
};

type Bounds = { from_ts: string; to_ts: string; now_ts: string; days: string[] };

type MetaCosts = CostsResponse['meta'];

/** "MARKETING" → "marketing"; Meta uses upper case in analytics and lower case in webhooks. */
const lower = (value: string | undefined, fallback: string) => (value ?? fallback).toLowerCase();

/**
 * What the workspace spent: WhatsApp messages as billed by Meta (pricing analytics, the source
 * of truth), and AI replies estimated from their stored token usage × list prices.
 * Owners and managers only.
 */
@Controller('costs')
@UseGuards(WorkspaceGuard)
export class CostsController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(WhatsAppAccessService) private readonly whatsapp: WhatsAppAccessService,
  ) {}

  @Get()
  async get(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query('period') periodParam: unknown,
    @Query('tz') tzParam: unknown,
  ): Promise<CostsResponse> {
    requireManager(workspace);
    const period = costPeriodSchema.catch('month').parse(periodParam);

    const local = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const tz = await postgresTimeZone(tx, tzParam);
      const bounds = await this.bounds(tx, period, tz);
      return { tz, bounds, ...(await this.localNumbers(tx, bounds, tz)) };
    });
    const meta = await this.metaCosts(workspace.tenantId, local.bounds, local.tz);

    return costsResponseSchema.parse({
      period,
      timezone: local.tz,
      from: new Date(local.bounds.from_ts).toISOString(),
      to: new Date(local.bounds.to_ts).toISOString(),
      generatedAt: new Date(local.bounds.now_ts).toISOString(),
      leads: local.leads,
      meta,
      ai: local.ai,
      billable: local.billable,
    });
  }

  private async bounds(tx: Transaction, period: CostPeriod, tz: string): Promise<Bounds> {
    const localNow = sql`(now() at time zone ${tz})`;
    const expr = (template: string) =>
      sql.join(
        template.split('LOCAL_NOW').map((part) => sql.raw(part)),
        localNow,
      );
    const { from, to } = PERIOD_SQL[period];
    const [row] = (
      await tx.execute<Bounds>(sql`
        select f at time zone ${tz} as from_ts,
               t at time zone ${tz} as to_ts,
               now() as now_ts,
               array(select to_char(d, 'YYYY-MM-DD')
                     from generate_series(date_trunc('day', f), t - interval '1 microsecond',
                                          interval '1 day') d) as days
        from (select ${expr(from)} as f, ${expr(to)} as t) b`)
    ).rows;
    return row!;
  }

  private async localNumbers(tx: Transaction, bounds: Bounds, tz: string) {
    const { from_ts: from, to_ts: to } = bounds;

    const [leadCounts] = (
      await tx.execute<{ new_leads: number; qualified: number }>(sql`
        select count(*)::int as new_leads,
               count(*) filter (where qualified_at is not null)::int as qualified
        from leads where created_at >= ${from} and created_at < ${to}`)
    ).rows;

    // Token usage per model and local day; cost is linear in tokens, so summing first is exact.
    const usage = (
      await tx.execute<{
        day: string;
        model: string;
        replies: number;
        input: number;
        cached: number;
        output: number;
      }>(sql`
        select to_char(created_at at time zone ${tz}, 'YYYY-MM-DD') as day,
               payload->'usage'->>'model' as model,
               count(*)::int as replies,
               coalesce(sum((payload->'usage'->>'inputTokens')::float8), 0)::float8 as input,
               coalesce(sum((payload->'usage'->>'cachedInputTokens')::float8), 0)::float8 as cached,
               coalesce(sum((payload->'usage'->>'outputTokens')::float8), 0)::float8 as output
        from messages
        where sender = 'ai' and direction = 'outbound' and payload ? 'usage'
          and created_at >= ${from} and created_at < ${to}
        group by 1, 2
        union all
        -- Conversation summaries written at the final score.
        select to_char((score_details->'summaryUsage'->>'at')::timestamptz at time zone ${tz},
                       'YYYY-MM-DD') as day,
               score_details->'summaryUsage'->>'model' as model,
               0 as replies,
               coalesce(sum((score_details->'summaryUsage'->>'inputTokens')::float8), 0)::float8,
               coalesce(sum((score_details->'summaryUsage'->>'cachedInputTokens')::float8), 0)::float8,
               coalesce(sum((score_details->'summaryUsage'->>'outputTokens')::float8), 0)::float8
        from leads
        where score_details->'summaryUsage' ? 'at'
          and (score_details->'summaryUsage'->>'at')::timestamptz >= ${from}
          and (score_details->'summaryUsage'->>'at')::timestamptz < ${to}
        group by 1, 2`)
    ).rows;

    const byModel = new Map<
      string,
      { replies: number; inputTokens: number; cachedInputTokens: number; outputTokens: number }
    >();
    const dailyAi = new Map(bounds.days.map((day) => [day, { costUsd: 0, replies: 0 }]));
    for (const row of usage) {
      const model = row.model ?? 'unknown';
      const totals = byModel.get(model) ?? {
        replies: 0,
        inputTokens: 0,
        cachedInputTokens: 0,
        outputTokens: 0,
      };
      totals.replies += row.replies;
      totals.inputTokens += row.input;
      totals.cachedInputTokens += row.cached;
      totals.outputTokens += row.output;
      byModel.set(model, totals);
      const cost = aiCostUsd({
        model,
        inputTokens: row.input,
        cachedInputTokens: row.cached,
        outputTokens: row.output,
      });
      const day = dailyAi.get(row.day);
      if (day) {
        day.replies += row.replies;
        day.costUsd += cost ?? 0;
      }
    }
    const models = [...byModel.entries()].map(([model, totals]) => ({
      model,
      ...totals,
      costUsd: aiCostUsd({ model, ...totals }),
    }));

    const billable = (
      await tx.execute<{
        id: string;
        lead_id: string;
        name: string | null;
        phone_e164: string;
        category: string | null;
        template_name: string | null;
        created_at: string;
      }>(sql`
        select m.id, m.lead_id, l.name, l.phone_e164, m.pricing->>'category' as category,
               m.payload->>'templateName' as template_name, m.created_at
        from messages m join leads l on l.id = m.lead_id
        where m.pricing->>'billable' = 'true'
          and m.created_at >= ${from} and m.created_at < ${to}
        order by m.created_at desc
        limit ${BILLABLE_LIMIT}`)
    ).rows;

    return {
      leads: { newLeads: leadCounts?.new_leads ?? 0, qualified: leadCounts?.qualified ?? 0 },
      ai: {
        totalUsd: models.reduce((sum, model) => sum + (model.costUsd ?? 0), 0),
        replies: models.reduce((sum, model) => sum + model.replies, 0),
        unpricedReplies: models
          .filter((model) => model.costUsd === null)
          .reduce((sum, model) => sum + model.replies, 0),
        inputTokens: models.reduce((sum, model) => sum + model.inputTokens, 0),
        cachedInputTokens: models.reduce((sum, model) => sum + model.cachedInputTokens, 0),
        outputTokens: models.reduce((sum, model) => sum + model.outputTokens, 0),
        byModel: models.sort((a, b) => (b.costUsd ?? 0) - (a.costUsd ?? 0)),
        daily: [...dailyAi.entries()].map(([day, value]) => ({ day, ...value })),
        pricesAsOf: AI_PRICES_AS_OF,
      },
      billable: billable.map((row) => ({
        messageId: row.id,
        leadId: row.lead_id,
        leadName: row.name,
        phone: row.phone_e164,
        category: row.category ?? 'unknown',
        templateName: row.template_name,
        sentAt: new Date(row.created_at).toISOString(),
      })),
    };
  }

  /** Meta's own numbers (daily, per category and pricing type), in the account's currency. */
  private async metaCosts(tenantId: string, bounds: Bounds, tz: string): Promise<MetaCosts> {
    const empty: MetaCosts = {
      status: 'ok',
      message: null,
      currency: null,
      totalCost: 0,
      billableMessages: 0,
      freeMessages: 0,
      breakdown: [],
      daily: bounds.days.map((day) => ({ day, cost: 0, volume: 0 })),
    };
    const access = await this.whatsapp.forTenant(tenantId);
    if (!access.ok) return { ...empty, status: 'not_connected', message: access.reason };

    let points: PricingAnalyticsPoint[];
    let currency: string | null;
    try {
      [points, currency] = await Promise.all([
        access.client.getPricingAnalytics(access.wabaId, {
          start: new Date(bounds.from_ts).getTime() / 1000,
          end: new Date(bounds.to_ts).getTime() / 1000,
        }),
        access.client.getWabaCurrency(access.wabaId),
      ]);
    } catch (error) {
      const message =
        error instanceof MetaApiError ? `WhatsApp (Meta): ${error.message}` : 'Meta is unreachable';
      return { ...empty, status: 'error', message };
    }

    const breakdown = new Map<string, MetaCosts['breakdown'][number]>();
    const daily = new Map(empty.daily.map((entry) => [entry.day, { ...entry }]));
    let billableMessages = 0;
    let freeMessages = 0;
    for (const point of points) {
      const category = lower(point.pricing_category, 'unknown');
      const pricingType = lower(point.pricing_type, 'unknown');
      const key = `${category}:${pricingType}`;
      const row = breakdown.get(key) ?? { category, pricingType, volume: 0, cost: 0 };
      row.volume += point.volume;
      row.cost += point.cost;
      breakdown.set(key, row);
      if (pricingType.startsWith('free')) freeMessages += point.volume;
      else billableMessages += point.volume;
      const day = daily.get(localDay(new Date(point.start * 1000), tz));
      if (day) {
        day.cost += point.cost;
        day.volume += point.volume;
      }
    }
    const rows = [...breakdown.values()].sort((a, b) => b.cost - a.cost || b.volume - a.volume);
    return {
      ...empty,
      currency,
      totalCost: rows.reduce((sum, row) => sum + row.cost, 0),
      billableMessages,
      freeMessages,
      breakdown: rows,
      daily: [...daily.values()],
    };
  }
}
