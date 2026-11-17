import type { PlaybookField } from '@qualify/shared';

export type LeadFields = Record<string, string>;

export interface MergeResult {
  fields: LeadFields;
  changed: string[];
  rejected: { key: string; value: string; reason: string }[];
}

const EMPTY_VALUES = new Set(['', 'unknown', 'null', 'none', 'n/a', 'na', 'not specified', '-']);
const YES = new Set(['yes', 'y', 'haan', 'han', 'ha', 'ji', 'true', 'ready', 'हाँ', 'हां']);
const NO = new Set(['no', 'n', 'nahi', 'nahin', 'na', 'false', 'नहीं']);

/** Normalises one extracted value for its field type. Returns null when it is not usable. */
export function normaliseFieldValue(field: PlaybookField, raw: string): string | null {
  const value = raw.trim();
  if (EMPTY_VALUES.has(value.toLowerCase())) return null;

  switch (field.type) {
    case 'choice': {
      const options = field.options ?? [];
      const lower = value.toLowerCase();
      return (
        options.find((option) => option.toLowerCase() === lower) ??
        options.find((option) => lower.startsWith(option.toLowerCase())) ??
        options.find((option) => option.toLowerCase().startsWith(lower)) ??
        null
      );
    }
    case 'yes_no': {
      const lower = value.toLowerCase();
      if (YES.has(lower)) return 'yes';
      if (NO.has(lower)) return 'no';
      return null;
    }
    case 'number': {
      const digits = value.replace(/[,\s]/g, '').match(/-?\d+(\.\d+)?/);
      return digits ? String(Number(digits[0])) : null;
    }
    case 'date_month': {
      if (value.toLowerCase() === 'flexible') return 'flexible';
      return /^\d{4}-(0[1-9]|1[0-2])$/.test(value) ? value : null;
    }
    case 'range':
    case 'text':
      return value.slice(0, 160);
  }
}

/**
 * Merges the model's extracted values into the lead's fields. Unknown keys and values that
 * don't fit the field type are rejected (reported, never stored). Corrections overwrite.
 */
export function mergeExtractedFields(
  definitions: readonly PlaybookField[],
  current: LeadFields,
  extracted: readonly { key: string; value: string }[],
): MergeResult {
  const byKey = new Map(definitions.map((field) => [field.key, field]));
  const fields: LeadFields = { ...current };
  const changed: string[] = [];
  const rejected: MergeResult['rejected'] = [];

  for (const { key, value } of extracted) {
    const field = byKey.get(key);
    if (!field) {
      rejected.push({ key, value, reason: 'unknown field' });
      continue;
    }
    const normalised = normaliseFieldValue(field, value);
    if (normalised === null) {
      rejected.push({ key, value, reason: `not a valid ${field.type}` });
      continue;
    }
    if (fields[key] !== normalised) {
      fields[key] = normalised;
      changed.push(key);
    }
  }
  return { fields, changed, rejected };
}

/** Required fields still missing, in the order they should be asked. */
export function missingRequiredFields(
  definitions: readonly PlaybookField[],
  fields: LeadFields,
): PlaybookField[] {
  return definitions
    .filter((field) => field.required && !fields[field.key])
    .sort((a, b) => a.priority - b.priority);
}

export function isQualificationComplete(
  definitions: readonly PlaybookField[],
  fields: LeadFields,
): boolean {
  return missingRequiredFields(definitions, fields).length === 0;
}
