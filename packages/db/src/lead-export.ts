import {
  LEAD_OUTCOME_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type LeadAttribution,
  type PlaybookField,
} from '@qualify/shared';
import type { LeadListRow } from './lead-list.ts';

/**
 * The columns and cells of the leads spreadsheet, shared by the Excel export (api) and the
 * scheduled e-mail reports (worker) so both files look the same.
 */
export interface LeadSheetColumn {
  header: string;
  key: string;
  width: number;
}

export type LeadSheetCells = Record<string, string | number | null>;

/** Ad headline, form name or campaign of the latest enquiry. */
export function originOf(attribution: LeadAttribution | null): string | null {
  if (!attribution) return null;
  return (
    attribution.headline ??
    attribution.formName ??
    (attribution.formId ? `Form ${attribution.formId}` : null) ??
    attribution.campaign ??
    (attribution.adId ? `Ad ${attribution.adId}` : null)
  );
}

/** "Hot", "Not a fit"… for a stored grade. */
export function gradeLabel(grade: string | null): string | null {
  if (!grade) return null;
  if (grade === 'disqualified') return 'Not a fit';
  return grade.charAt(0).toUpperCase() + grade.slice(1);
}

/** The questions of every given agent config, in order, without duplicate keys. */
export function sheetQuestions(
  configs: readonly { fields: readonly PlaybookField[] }[],
): PlaybookField[] {
  const seen = new Set<string>();
  return configs
    .flatMap((config) => [...config.fields].sort((a, b) => a.priority - b.priority))
    .filter((field) => !seen.has(field.key) && Boolean(seen.add(field.key)));
}

export function leadSheetColumns(definitions: readonly PlaybookField[]): LeadSheetColumn[] {
  return [
    { header: 'Created', key: 'created', width: 18 },
    { header: 'Name', key: 'name', width: 22 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Grade', key: 'grade', width: 10 },
    { header: 'Score', key: 'score', width: 8 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Why this score', key: 'reason', width: 40 },
    { header: 'Summary', key: 'summary', width: 50 },
    { header: 'Source', key: 'source', width: 18 },
    { header: 'Ad / form / campaign', key: 'origin', width: 28 },
    { header: 'Ad id', key: 'adId', width: 20 },
    ...definitions.map((field) => ({
      header: field.label,
      key: `field:${field.key}`,
      width: 20,
    })),
    { header: 'Other answers', key: 'other', width: 30 },
    { header: 'Outcome', key: 'outcome', width: 14 },
    { header: 'Deal value', key: 'dealValue', width: 14 },
    { header: 'Last message', key: 'lastMessage', width: 18 },
    { header: 'Qualified at', key: 'qualifiedAt', width: 18 },
    { header: 'Handed off at', key: 'handoffAt', width: 18 },
    { header: 'Conversation', key: 'link', width: 30 },
    { header: 'Lead id', key: 'id', width: 38 },
  ];
}

/** "/conversations?lead=<id>" on the dashboard. */
export function conversationUrl(appBaseUrl: string, leadId: string): string {
  return `${appBaseUrl.replace(/\/$/, '')}/conversations?lead=${leadId}`;
}

export function leadSheetCells(
  row: LeadListRow,
  definitions: readonly PlaybookField[],
  options: { timeZone: string; appBaseUrl: string },
): LeadSheetCells {
  const format = new Intl.DateTimeFormat('sv-SE', {
    timeZone: options.timeZone,
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const local = (text: string | null) => (text ? format.format(new Date(text)) : null);
  const known = new Set(definitions.map((field) => field.key));
  const other = Object.entries(row.fields)
    .filter(([key]) => !known.has(key))
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
  return {
    created: local(row.createdAt),
    name: row.name,
    phone: row.phone,
    grade: gradeLabel(row.grade),
    score: row.score,
    status: LEAD_STATUS_LABELS[row.status as keyof typeof LEAD_STATUS_LABELS] ?? row.status,
    reason: row.scoreDetails?.reason ?? null,
    summary: row.summary,
    source: LEAD_SOURCE_LABELS[row.source as keyof typeof LEAD_SOURCE_LABELS] ?? row.source,
    origin: originOf(row.attribution),
    adId: row.attribution?.adId ?? null,
    ...Object.fromEntries(
      definitions.map((field) => [`field:${field.key}`, row.fields[field.key] ?? null]),
    ),
    other: other || null,
    outcome: row.outcome ? LEAD_OUTCOME_LABELS[row.outcome.outcome] : null,
    dealValue:
      row.outcome?.value !== undefined
        ? `${row.outcome.value}${row.outcome.currency ? ` ${row.outcome.currency}` : ''}`
        : null,
    lastMessage: local(row.lastMessageAt),
    qualifiedAt: local(row.qualifiedAt),
    handoffAt: local(row.handoffAt),
    link: conversationUrl(options.appBaseUrl, row.id),
    id: row.id,
  };
}
