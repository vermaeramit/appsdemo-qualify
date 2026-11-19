import { deliveryErrorMessage } from '@qualify/core';
import { type Database, recordActivity } from '@qualify/db';
import type { ActivityDetail, ActivityInput, ActivityLevel } from '@qualify/shared';
import type { Logger } from './logger.ts';

/**
 * Writes activity log entries (D-091). Never throws: a failed log write is reported to the
 * server log and the job carries on.
 */
export type RecordActivity = (entries: ActivityInput | readonly ActivityInput[]) => Promise<void>;

export function createActivityRecorder(db: Database, logger: Pick<Logger, 'warn'>): RecordActivity {
  return async (entries) => {
    const error = await recordActivity(db, entries);
    if (error) logger.warn({ err: error }, 'Activity log write failed');
  };
}

/** A short quote of a message for the log. */
export function quote(text: string | null | undefined, max = 120): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return '';
  return `“${flat.length > max ? `${flat.slice(0, max - 1)}…` : flat}”`;
}

/** Why a send failed, for the log: the plain reason plus Meta's code and details. */
export function sendErrorDetail(error: Record<string, unknown> | null): ActivityDetail {
  if (!error) return {};
  const first: unknown = Array.isArray(error.errors) ? error.errors[0] : undefined;
  const meta = (first && typeof first === 'object' ? first : error) as {
    code?: unknown;
    title?: unknown;
    message?: unknown;
    error_data?: { details?: unknown };
  };
  const detail: ActivityDetail = { Reason: deliveryErrorMessage(error) };
  if (typeof meta.code === 'number' || typeof meta.code === 'string') {
    detail['Meta error code'] = meta.code;
  }
  if (typeof meta.error_data?.details === 'string')
    detail['Meta details'] = meta.error_data.details;
  else if (typeof meta.title === 'string' && meta.title !== detail.Reason) {
    detail['Meta title'] = meta.title;
  }
  return detail;
}

/** Short reason text from a send error. */
export function sendErrorReason(error: Record<string, unknown> | null): string {
  return deliveryErrorMessage(error).replace(/^Not delivered:\s*/, '');
}

export interface SkipEntry {
  level: ActivityLevel;
  message: string;
}

/** An outcome that ends a job without doing anything, as a log entry (or none for noise). */
export function skipEntry<T extends string>(
  table: Partial<Record<T, SkipEntry>>,
  outcome: T,
  base: { tenantId: string; leadId: string; source: ActivityInput['source']; kind: string },
): ActivityInput | null {
  const entry = table[outcome];
  return entry ? { ...base, level: entry.level, message: entry.message } : null;
}

export const DEV_SWITCH_REASON =
  'development safety switch (only numbers in DEV_ALLOWED_NUMBERS get messages in development)';
