import { sql, type Transaction } from '@qualify/db';

/** A valid IANA time zone known to Node, or UTC. */
export function safeTimeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 64) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return value;
  } catch {
    return 'UTC';
  }
}

/** Node and Postgres ship separate zone databases; fall back to UTC if Postgres lacks it. */
export async function postgresTimeZone(tx: Transaction, value: unknown): Promise<string> {
  const tz = safeTimeZone(value);
  if (tz === 'UTC') return tz;
  const { rows } = await tx.execute<{ known: boolean }>(
    sql`select exists(select 1 from pg_timezone_names where name = ${tz}) as known`,
  );
  return rows[0]?.known ? tz : 'UTC';
}

/** "2026-11-18" for an instant, in a time zone. */
export function localDay(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
