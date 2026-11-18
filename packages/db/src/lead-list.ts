import { type SQL, sql } from 'drizzle-orm';
import type { LeadAttribution, LeadScoreDetails, StoredLeadOutcome } from '@qualify/shared';
import type { Transaction } from './tenant.ts';

export type LeadListSort = 'newest' | 'activity' | 'score';

export interface LeadListKey {
  /** Timestamp text (newest/activity) or the score as text (score). */
  sortKey: string;
  id: string;
}

export interface LeadListFilters {
  timeZone: string;
  /** Created on or after this local day (YYYY-MM-DD). Default: 29 days before `to`. */
  from?: string | undefined;
  /** Created on or before this local day. Default: today in `timeZone`. */
  to?: string | undefined;
  /** Name or phone contains this text. */
  q?: string | undefined;
  statuses?: readonly string[] | undefined;
  grades?: readonly string[] | undefined;
  sources?: readonly string[] | undefined;
}

export interface LeadListRow {
  id: string;
  name: string | null;
  phone: string;
  source: string;
  status: string;
  grade: string | null;
  score: number | null;
  scoreDetails: LeadScoreDetails | null;
  summary: string | null;
  fields: Record<string, string>;
  attribution: LeadAttribution | null;
  outcome: StoredLeadOutcome | null;
  playbookVersionId: string | null;
  createdAt: string;
  lastMessageAt: string | null;
  qualifiedAt: string | null;
  handoffAt: string | null;
}

type RawRow = {
  id: string;
  name: string | null;
  phone_e164: string;
  source: string;
  status: string;
  grade: string | null;
  score: number | null;
  score_details: LeadScoreDetails | null;
  summary: string | null;
  fields: Record<string, string> | null;
  attribution: LeadAttribution | null;
  outcome: StoredLeadOutcome | null;
  playbook_version_id: string | null;
  created_at: string;
  last_message_at: string | null;
  qualified_at: string | null;
  handoff_at: string | null;
  sort_key: string;
};

// Each sort reads its own index backwards: leads_tenant_created_idx, leads_tenant_activity_idx,
// leads_tenant_score_idx (all ascending composites ending in id).
const SORT_EXPR: Record<LeadListSort, { expr: SQL; cast: SQL }> = {
  newest: { expr: sql`l.created_at`, cast: sql`timestamptz` },
  activity: { expr: sql`coalesce(l.last_message_at, l.created_at)`, cast: sql`timestamptz` },
  score: { expr: sql`coalesce(l.score, -1)`, cast: sql`int` },
};

/** "50%" or "a_b" typed by a user must match literally in LIKE. */
const likeEscape = (text: string) => text.replace(/[\\%_]/g, (char) => `\\${char}`);

/** Resolves the inclusive local-day range (defaults: the last 30 days). */
async function resolveRange(tx: Transaction, filters: LeadListFilters) {
  const tz = filters.timeZone;
  const [range] = (
    await tx.execute<{ from_day: string; to_day: string }>(sql`
      select to_char(coalesce(${filters.from ?? null}::date,
                              (now() at time zone ${tz})::date - 29), 'YYYY-MM-DD') as from_day,
             to_char(coalesce(${filters.to ?? null}::date,
                              (now() at time zone ${tz})::date), 'YYYY-MM-DD') as to_day`)
  ).rows;
  return { from: range!.from_day, to: range!.to_day };
}

function whereClause(filters: LeadListFilters, range: { from: string; to: string }): SQL {
  const tz = filters.timeZone;
  const parts: SQL[] = [
    sql`l.created_at >= (${range.from}::date)::timestamp at time zone ${tz}`,
    sql`l.created_at < (${range.to}::date + 1)::timestamp at time zone ${tz}`,
  ];
  const q = filters.q?.trim();
  if (q) {
    const text = `%${likeEscape(q)}%`;
    const digits = q.replace(/\D/g, '');
    parts.push(
      digits.length >= 3
        ? sql`(l.name ilike ${text} or l.phone_e164 like ${`%${digits}%`})`
        : sql`l.name ilike ${text}`,
    );
  }
  if (filters.statuses?.length) {
    parts.push(
      sql`l.status in (${sql.join(
        filters.statuses.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  if (filters.grades?.length) {
    const grades = filters.grades.filter((grade) => grade !== 'none');
    const none = filters.grades.includes('none');
    const inList = grades.length
      ? sql`l.grade in (${sql.join(
          grades.map((g) => sql`${g}`),
          sql`, `,
        )})`
      : null;
    parts.push(
      inList && none ? sql`(${inList} or l.grade is null)` : (inList ?? sql`l.grade is null`),
    );
  }
  if (filters.sources?.length) {
    parts.push(
      sql`l.source in (${sql.join(
        filters.sources.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    );
  }
  return sql.join(parts, sql` and `);
}

/**
 * Leads matching the filters, keyset-paginated for the chosen sort (newest first, latest
 * activity, or highest score). Used by the leads list and the Excel export. Run in withTenant().
 */
export async function listLeads(
  tx: Transaction,
  input: LeadListFilters & {
    sort: LeadListSort;
    limit: number;
    after?: LeadListKey | null | undefined;
    /** Skip the total count (the export pages through everything). */
    withTotal?: boolean;
  },
): Promise<{
  rows: LeadListRow[];
  next: LeadListKey | null;
  total: number | null;
  from: string;
  to: string;
}> {
  const range = await resolveRange(tx, input);
  const where = whereClause(input, range);
  const { expr, cast } = SORT_EXPR[input.sort];
  const after = input.after
    ? sql`and (${expr}, l.id) < (${input.after.sortKey}::${cast}, ${input.after.id}::uuid)`
    : sql``;

  const raw = (
    await tx.execute<RawRow>(sql`
      select l.id, l.name, l.phone_e164, l.source, l.status, l.grade, l.score, l.score_details,
             l.summary, l.fields, l.attribution, l.outcome, l.playbook_version_id, l.created_at::text as created_at,
             l.last_message_at::text as last_message_at, l.qualified_at::text as qualified_at,
             l.handoff_at::text as handoff_at, (${expr})::text as sort_key
      from leads l
      where ${where} ${after}
      order by ${expr} desc, l.id desc
      limit ${input.limit + 1}`)
  ).rows;
  const page = raw.slice(0, input.limit);
  const last = page.at(-1);

  let total: number | null = null;
  if (input.withTotal !== false) {
    const [counted] = (
      await tx.execute<{ total: number }>(
        sql`select count(*)::int as total from leads l where ${where}`,
      )
    ).rows;
    total = counted?.total ?? 0;
  }

  return {
    rows: page.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone_e164,
      source: row.source,
      status: row.status,
      grade: row.grade,
      score: row.score,
      scoreDetails: row.score_details,
      summary: row.summary,
      fields: row.fields ?? {},
      attribution: row.attribution,
      outcome: row.outcome,
      playbookVersionId: row.playbook_version_id,
      createdAt: row.created_at,
      lastMessageAt: row.last_message_at,
      qualifiedAt: row.qualified_at,
      handoffAt: row.handoff_at,
    })),
    next: raw.length > input.limit && last ? { sortKey: last.sort_key, id: last.id } : null,
    total,
    from: range.from,
    to: range.to,
  };
}
