import { sql } from 'drizzle-orm';
import type { Transaction } from './tenant.ts';

export interface SubmissionKey {
  /** created_at as Postgres text (keeps microseconds). */
  sortKey: string;
  id: string;
}

export interface SubmissionRow {
  id: string;
  createdAt: string;
  leadgenId: string;
  formId: string;
  formName: string | null;
  pageId: string;
  pageName: string | null;
  adId: string | null;
  fieldData: unknown;
  leadId: string | null;
  leadName: string | null;
  leadPhone: string | null;
}

export interface SubmissionPage {
  rows: SubmissionRow[];
  /** Key of the last row when more rows follow, else null. */
  next: SubmissionKey | null;
  total: number;
  /** The resolved range (YYYY-MM-DD, inclusive) in `timeZone`. */
  from: string;
  to: string;
  /** Forms with submissions in the range (ignores the form filter), most used first. */
  forms: { formId: string; formName: string | null; count: number }[];
}

type RawRow = {
  id: string;
  created_at: string;
  leadgen_id: string;
  form_id: string;
  form_name: string | null;
  page_id: string;
  page_name: string | null;
  ad_id: string | null;
  field_data: unknown;
  lead_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
};

/**
 * Lead form submissions in a date range, newest first, keyset-paginated on (created_at, id).
 * Reads lead_form_submissions_tenant_created_idx backwards, so every page costs the same however
 * far back it is. Run inside withTenant(). `timeZone` must be a valid Postgres time zone.
 */
export async function listLeadFormSubmissions(
  tx: Transaction,
  input: {
    timeZone: string;
    /** Defaults to 29 days before `to`'s default (the last 30 days). */
    from?: string | undefined;
    /** Defaults to today in `timeZone`. */
    to?: string | undefined;
    formId?: string | undefined;
    limit: number;
    after?: SubmissionKey | null | undefined;
  },
): Promise<SubmissionPage> {
  const tz = input.timeZone;
  const [range] = (
    await tx.execute<{ from_day: string; to_day: string }>(sql`
      select to_char(coalesce(${input.from ?? null}::date,
                              (now() at time zone ${tz})::date - 29), 'YYYY-MM-DD') as from_day,
             to_char(coalesce(${input.to ?? null}::date,
                              (now() at time zone ${tz})::date), 'YYYY-MM-DD') as to_day`)
  ).rows;
  const from = range!.from_day;
  const to = range!.to_day;
  const inRange = sql`s.created_at >= (${from}::date)::timestamp at time zone ${tz}
    and s.created_at < (${to}::date + 1)::timestamp at time zone ${tz}`;
  const formFilter = input.formId ? sql`and s.form_id = ${input.formId}` : sql``;
  const after = input.after
    ? sql`and (s.created_at, s.id) < (${input.after.sortKey}::timestamptz, ${input.after.id}::uuid)`
    : sql``;

  const raw = (
    await tx.execute<RawRow>(sql`
      select s.id, s.created_at::text as created_at, s.leadgen_id, s.form_id,
             m.form_name, s.page_id, p.name as page_name, s.ad_id, s.field_data,
             l.id as lead_id, l.name as lead_name, l.phone_e164 as lead_phone
      from lead_form_submissions s
      left join lead_form_mappings m on m.form_id = s.form_id
      left join facebook_pages p on p.page_id = s.page_id
      left join leads l on l.id = s.lead_id
      where ${inRange} ${formFilter} ${after}
      order by s.created_at desc, s.id desc
      limit ${input.limit + 1}`)
  ).rows;
  const rows = raw.slice(0, input.limit);
  const last = rows.at(-1);

  const [counted] = (
    await tx.execute<{ total: number }>(sql`
      select count(*)::int as total from lead_form_submissions s
      where ${inRange} ${formFilter}`)
  ).rows;
  const forms = (
    await tx.execute<{ form_id: string; form_name: string | null; count: number }>(sql`
      select s.form_id, max(m.form_name) as form_name, count(*)::int as count
      from lead_form_submissions s
      left join lead_form_mappings m on m.form_id = s.form_id
      where ${inRange}
      group by s.form_id
      order by count desc, s.form_id
      limit 50`)
  ).rows;

  return {
    rows: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      leadgenId: row.leadgen_id,
      formId: row.form_id,
      formName: row.form_name,
      pageId: row.page_id,
      pageName: row.page_name,
      adId: row.ad_id,
      fieldData: row.field_data,
      leadId: row.lead_id,
      leadName: row.lead_name,
      leadPhone: row.lead_phone,
    })),
    next: raw.length > input.limit && last ? { sortKey: last.created_at, id: last.id } : null,
    total: counted?.total ?? 0,
    from,
    to,
    forms: forms.map((form) => ({
      formId: form.form_id,
      formName: form.form_name,
      count: form.count,
    })),
  };
}
