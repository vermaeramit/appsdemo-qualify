import { zodResolver } from '@hookform/resolvers/zod';
import { resolveOpening } from '@qualify/core';
import {
  type FieldType,
  type PlaybookConfig,
  playbookConfigSchema,
  type PlaybookField,
} from '@qualify/shared';
import type { FieldErrors, Resolver } from 'react-hook-form';

/** The editor always works on a config with an explicit opening. */
export type EditorConfig = PlaybookConfig & { opening: NonNullable<PlaybookConfig['opening']> };

export function toEditorConfig(config: PlaybookConfig): EditorConfig {
  return { ...config, opening: resolveOpening(config) };
}

/** How the lead answers, as the editor groups the field types. */
export type AnswerStyle = 'options' | 'yes_no' | 'plain';

export function answerStyleOf(type: FieldType): AnswerStyle {
  if (type === 'choice') return 'options';
  if (type === 'yes_no') return 'yes_no';
  return 'plain';
}

export const PLAIN_TYPES: { value: FieldType; label: string; hint: string }[] = [
  { value: 'text', label: 'Text', hint: 'Any answer, e.g. a city or a name' },
  { value: 'number', label: 'Number', hint: 'e.g. number of nights' },
  { value: 'range', label: 'Amount or range', hint: 'e.g. budget ₹50k–1L' },
  { value: 'date_month', label: 'Month or date', hint: 'e.g. December 2026' },
];

/** Lowercase key for a new question, unique among the others: "Hotel category" → "hotel_category". */
export function keyFromLabel(label: string, taken: ReadonlySet<string>): string {
  const base =
    label
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/^[^a-z]+/, '')
      .slice(0, 36) || 'question';
  const padded = base.length < 2 ? `${base}_q` : base;
  if (!taken.has(padded)) return padded;
  for (let n = 2; ; n += 1) {
    const candidate = `${padded}_${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function newQuestion(style: AnswerStyle, taken: ReadonlySet<string>): PlaybookField {
  const key = keyFromLabel('question', taken);
  const base = { key, label: '', required: false, priority: 99, question: '' };
  if (style === 'options') return { ...base, type: 'choice', options: [] };
  if (style === 'yes_no') return { ...base, type: 'yes_no' };
  return { ...base, type: 'text' };
}

/** Number of {{n}} placeholders an opening text uses (the highest n). */
export function placeholderCount(text: string): number {
  let max = 0;
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) max = Math.max(max, Number(match[1]));
  return max;
}

/**
 * Normalises what the editor holds into what the API stores: order → priority, empty optional
 * text → omitted, options only for option questions, one variable per {{n}}.
 */
export function cleanConfig(values: EditorConfig): EditorConfig {
  const used = placeholderCount(values.opening.bodyText);
  const params = values.opening.bodyParams.slice(0, used);
  while (params.length < used) params.push('lead.firstName');
  return {
    ...values,
    fields: values.fields.map((field, index) => {
      const { question, guidance, options, allowOther, ...rest } = field;
      const isChoice = field.type === 'choice';
      return {
        ...rest,
        priority: index + 1,
        ...(question?.trim() ? { question: question.trim() } : {}),
        ...(guidance?.trim() ? { guidance: guidance.trim() } : {}),
        ...(isChoice ? { options: (options ?? []).map((option) => option.trim()) } : {}),
        ...(isChoice && allowOther ? { allowOther: true } : {}),
      };
    }),
    opening: { ...values.opening, bodyParams: params },
  };
}

const validateConfig = zodResolver(playbookConfigSchema);

/** Validates the cleaned config with the shared schema (same rules as the API). */
export const editorResolver: Resolver<EditorConfig> = (values, context, options) =>
  validateConfig(
    cleanConfig(values),
    context,
    // Same field names: the cleaned config has the editor's shape.
    options as Parameters<typeof validateConfig>[2],
  ) as ReturnType<Resolver<EditorConfig>>;

/** Zod's default messages, in plain words. */
export function friendlyError(message: string | undefined): string | undefined {
  if (!message) return undefined;
  if (/need at least 2 options/.test(message)) return 'Add at least 2 options';
  if (/expected string to have >=1/.test(message)) return 'Required';
  const tooLong = /expected string to have <=(\d+)/.exec(message);
  if (tooLong) return `Keep it under ${tooLong[1]} characters`;
  const tooFew = /expected array to have >=(\d+)/.exec(message);
  if (tooFew) return `Add at least ${tooFew[1]}`;
  const tooMany = /expected array to have <=(\d+)/.exec(message);
  if (tooMany) return `At most ${tooMany[1]} allowed`;
  return message;
}

/** Which editor tab holds a validation error (to jump there on publish). */
export function tabWithError(errors: FieldErrors<EditorConfig>): string | null {
  if (errors.fields) return 'questions';
  if (errors.opening) return 'opening';
  if (errors.persona || errors.business || errors.goal || errors.rules) return 'behaviour';
  if (errors.handoff || errors.closing) return 'behaviour';
  if (errors.knowledgeBase) return 'knowledge';
  return null;
}
