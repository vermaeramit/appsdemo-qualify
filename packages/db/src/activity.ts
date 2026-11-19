import {
  type ActivityDetail,
  type ActivityEntry,
  type ActivityHealth,
  type ActivityInput,
  activityInputSchema,
  type ActivitySource,
  META_SILENCE_MINUTES,
} from '@qualify/shared';
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { activityLog } from './schema/activity.ts';
import { phoneNumbers } from './schema/messaging.ts';
import { type Transaction, withTenant } from './tenant.ts';

const MAX_MESSAGE = 500;
const MAX_TEXT = 2_000;

/** Fits an entry into the contract (long text is cut, not refused): a log must never be lost. */
function fitEntry(entry: ActivityInput) {
  const detail: ActivityDetail = {};
  for (const [label, value] of Object.entries(entry.detail ?? {}).slice(0, 30)) {
    if (value === undefined) continue;
    detail[label.slice(0, 60)] = typeof value === 'string' ? value.slice(0, MAX_TEXT) : value;
  }
  return activityInputSchema.parse({
    ...entry,
    message: entry.message.slice(0, MAX_MESSAGE),
    detail,
  });
}

/**
 * Records activity entries (D-091), each inside its own tenant's scope. Never throws: logging
 * must not break the work it describes. Returns the error, if any, so the caller can log it.
 */
export async function recordActivity(
  db: Database,
  entries: ActivityInput | readonly ActivityInput[],
): Promise<unknown> {
  const list = (Array.isArray(entries) ? entries : [entries]) as readonly ActivityInput[];
  if (!list.length) return null;
  try {
    const byTenant = new Map<string, ReturnType<typeof fitEntry>[]>();
    for (const entry of list) {
      const fitted = fitEntry(entry);
      byTenant.set(fitted.tenantId, [...(byTenant.get(fitted.tenantId) ?? []), fitted]);
    }
    for (const [tenantId, rows] of byTenant) {
      await withTenant(db, tenantId, (tx) =>
        tx.insert(activityLog).values(
          rows.map((row, index) => ({
            tenantId,
            // The insert's own clock (not the transaction start), one microsecond apart, so
            // entries written together keep their order.
            at: sql`clock_timestamp() + ${index} * interval '1 microsecond'`,
            leadId: row.leadId ?? null,
            source: row.source,
            kind: row.kind,
            level: row.level,
            message: row.message,
            detail: row.detail,
          })),
        ),
      );
    }
    return null;
  } catch (error) {
    return error;
  }
}

export interface ActivityFilters {
  leadId?: string;
  source?: ActivitySource;
  /** Only warnings and errors. */
  problems?: boolean;
  /** Keyset cursor: entries older than this (at, id). */
  before?: { sortKey: string; id: string } | null;
  limit: number;
}

/** A page of activity, newest first (keyset on (at, id), read backwards on ascending indexes). */
export async function listActivity(
  tx: Transaction,
  filters: ActivityFilters,
): Promise<{ items: ActivityEntry[]; next: { sortKey: string; id: string } | null }> {
  const conditions = [
    filters.leadId ? sql`a.lead_id = ${filters.leadId}::uuid` : null,
    filters.source ? sql`a.source = ${filters.source}` : null,
    filters.problems ? sql`a.level <> 'info'` : null,
    filters.before
      ? sql`(a.at, a.id) < (${filters.before.sortKey}::timestamptz, ${filters.before.id}::uuid)`
      : null,
  ].filter((condition) => condition !== null);
  const where = conditions.length ? sql.join(conditions, sql` and `) : sql`true`;
  const { rows } = await tx.execute<{
    id: string;
    at_text: string;
    source: ActivitySource;
    kind: string;
    level: ActivityEntry['level'];
    message: string;
    detail: ActivityDetail;
    lead_id: string | null;
    lead_name: string | null;
    lead_phone: string | null;
  }>(sql`
    select a.id, a.at::text as at_text, a.source, a.kind, a.level, a.message, a.detail,
           l.id as lead_id, l.name as lead_name, l.phone_e164 as lead_phone
    from activity_log a
    left join leads l on l.id = a.lead_id
    where ${where}
    order by a.at desc, a.id desc
    limit ${filters.limit + 1}`);
  const page = rows.slice(0, filters.limit);
  const last = page.at(-1);
  return {
    items: page.map((row) => ({
      id: row.id,
      at: new Date(row.at_text).toISOString(),
      source: row.source,
      kind: row.kind,
      level: row.level,
      message: row.message,
      detail: row.detail,
      lead:
        row.lead_id && row.lead_phone
          ? { id: row.lead_id, name: row.lead_name, phone: row.lead_phone }
          : null,
    })),
    next: rows.length > filters.limit && last ? { sortKey: last.at_text, id: last.id } : null,
  };
}

/** Tolerance: Meta's "sent" webhook can be processed just before our own insert commits. */
const EVENT_CLOCK_SLACK_MS = 60_000;

/**
 * Is Meta reaching us? Meta sends a webhook for every message we send, so a message sent more
 * than META_SILENCE_MINUTES ago with no webhook since means Meta can't reach our webhook URL.
 */
export async function activityHealth(tx: Transaction, now = new Date()): Promise<ActivityHealth> {
  const { rows } = await tx.execute<{
    phone: string | null;
    has_number: boolean;
    last_event_at: string | null;
    last_sent_at: string | null;
    errors: number;
    warnings: number;
  }>(sql`
    select
      (select p.display_phone from phone_numbers p where p.status = 'active'
        order by p.last_event_at desc nulls last limit 1) as phone,
      exists (select 1 from phone_numbers p where p.status = 'active') as has_number,
      (select max(p.last_event_at)::text from phone_numbers p where p.status = 'active')
        as last_event_at,
      (select m.created_at::text from messages m
        where m.direction = 'outbound' and m.wa_message_id is not null
          and m.sender <> 'human_app'
        order by m.created_at desc limit 1) as last_sent_at,
      (select count(*)::int from activity_log a
        where a.level = 'error' and a.at > now() - interval '24 hours') as errors,
      (select count(*)::int from activity_log a
        where a.level = 'warn' and a.at > now() - interval '24 hours') as warnings`);
  const row = rows[0]!;
  const lastEventAt = row.last_event_at ? new Date(row.last_event_at) : null;
  const lastSentAt = row.last_sent_at ? new Date(row.last_sent_at) : null;
  const silent =
    row.has_number &&
    lastSentAt !== null &&
    now.getTime() - lastSentAt.getTime() > META_SILENCE_MINUTES * 60_000 &&
    (lastEventAt === null || lastEventAt.getTime() < lastSentAt.getTime() - EVENT_CLOCK_SLACK_MS);
  return {
    number: row.has_number
      ? { phone: row.phone, lastEventAt: lastEventAt?.toISOString() ?? null }
      : null,
    lastSentAt: lastSentAt?.toISOString() ?? null,
    problem: !row.has_number ? 'no_number' : silent ? 'silent' : null,
    last24h: { errors: row.errors, warnings: row.warnings },
  };
}

/** Notes that Meta reached us for this number (written at most every 10 seconds). */
export async function touchNumberEvent(
  db: Database,
  tenantId: string,
  phoneNumberId: string,
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(phoneNumbers)
      .set({ lastEventAt: sql`now()` })
      .where(
        and(
          eq(phoneNumbers.phoneNumberId, phoneNumberId),
          or(
            isNull(phoneNumbers.lastEventAt),
            lt(phoneNumbers.lastEventAt, sql`now() - interval '10 seconds'`),
          ),
        ),
      ),
  );
}

/** Deletes entries older than `days` across tenants, in batches (narrow definer function). */
export async function pruneActivity(db: Database, days: number, batch = 5_000): Promise<number> {
  let total = 0;
  for (;;) {
    const { rows } = await db.execute<{ removed: number }>(
      sql`select prune_activity_log(${days}, ${batch}) as removed`,
    );
    const removed = rows[0]?.removed ?? 0;
    total += removed;
    if (removed < batch) return total;
  }
}
