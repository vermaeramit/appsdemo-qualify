import type { PlaybookField } from '@qualify/shared';
import { type LeadFields, normaliseFieldValue } from './fields.ts';

/** A lead form question as Meta describes it (custom questions have options). */
export interface FormQuestion {
  key: string;
  label?: string | undefined;
  options?: { key: string; value: string }[] | undefined;
}

/** Form key → playbook question key (null = not used). */
export type FormMapping = Record<string, string | null>;

/** Meta's standard contact questions, handled before any mapping. */
const CONTACT_KEYS = new Set(['full_name', 'first_name', 'last_name', 'phone_number', 'email']);

const STOPWORDS = new Set(
  'a an and are can could do does for have how i in is it me my of on or our please the to we what when where which who would you your like mind'.split(
    ' ',
  ),
);

function words(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 1 && !STOPWORDS.has(word)),
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

/**
 * Maps form questions to playbook questions by key and wording (used when no AI is configured,
 * and as a check on the AI's answer). Each playbook question is used at most once.
 */
export function guessFormMapping(
  questions: readonly FormQuestion[],
  definitions: readonly PlaybookField[],
): FormMapping {
  const asked = questions.filter((question) => !CONTACT_KEYS.has(question.key));
  // Score every pair, then assign the best matches first, so an earlier, weaker match can't
  // take a playbook question from a later, clearer one.
  const pairs = asked.flatMap((question) => {
    const words1 = words(`${question.key.replace(/_/g, ' ')} ${question.label ?? ''}`);
    return definitions.map((field) => ({
      question: question.key,
      field: field.key,
      score:
        field.key === question.key
          ? 2
          : overlap(
              words1,
              words(`${field.key.replace(/_/g, ' ')} ${field.label} ${field.question ?? ''}`),
            ),
    }));
  });
  const mapping: FormMapping = Object.fromEntries(asked.map((question) => [question.key, null]));
  const usedFields = new Set<string>();
  for (const pair of pairs
    .filter((candidate) => candidate.score >= 0.5)
    .sort((a, b) => b.score - a.score)) {
    if (mapping[pair.question] || usedFields.has(pair.field)) continue;
    mapping[pair.question] = pair.field;
    usedFields.add(pair.field);
  }
  return mapping;
}

/** The prompt that asks the model to map a form's questions to the playbook's questions. */
export function buildFormMappingRequest(
  questions: readonly FormQuestion[],
  definitions: readonly PlaybookField[],
): { system: string; prompt: string } {
  const formLines = questions
    .filter((question) => !CONTACT_KEYS.has(question.key))
    .map(
      (question) =>
        `- formKey "${question.key}": ${question.label ?? question.key}${
          question.options?.length
            ? ` (options: ${question.options.map((option) => option.value).join(' | ')})`
            : ''
        }`,
    );
  const fieldLines = definitions.map(
    (field) =>
      `- fieldKey "${field.key}": ${field.label} — ${field.question ?? ''} (${field.type}${
        field.options?.length ? `: ${field.options.join(' | ')}` : ''
      })`,
  );
  return {
    system:
      'You map the questions of a Meta lead form to the questions a sales agent asks. Map a form question only when its answer clearly answers the agent question; otherwise use null. Use each agent question at most once. Return one entry per form question.',
    prompt: `Lead form questions:\n${formLines.join('\n') || '(none)'}\n\nAgent questions:\n${fieldLines.join('\n')}`,
  };
}

/** Keeps only valid, one-to-one mappings to existing playbook questions. */
export function sanitizeFormMapping(
  mapping: FormMapping,
  questions: readonly FormQuestion[],
  definitions: readonly PlaybookField[],
): FormMapping {
  const keys = new Set(definitions.map((field) => field.key));
  const used = new Set<string>();
  const clean: FormMapping = {};
  for (const question of questions) {
    if (CONTACT_KEYS.has(question.key)) continue;
    const target = mapping[question.key];
    if (target && keys.has(target) && !used.has(target)) {
      clean[question.key] = target;
      used.add(target);
    } else {
      clean[question.key] = null;
    }
  }
  return clean;
}

export interface FormAnswers {
  name: string | null;
  phone: string | null;
  /** Playbook answers, normalised (e.g. "December 2026" → "2026-12"). */
  fields: LeadFields;
  /** Answers that didn't map or didn't fit, kept for the team to read. */
  other: { label: string; value: string }[];
}

/** Meta sends option keys like "december_2026"; show them as the option's text. */
function readable(value: string, question: FormQuestion | undefined): string {
  const option = question?.options?.find((candidate) => candidate.key === value);
  if (option) return option.value;
  return /\s/.test(value) ? value : value.replace(/_/g, ' ');
}

/** Turns Meta's field_data into the lead's name, phone and playbook answers. */
export function readFormAnswers(input: {
  fieldData: readonly { name: string; values: readonly string[] }[];
  questions: readonly FormQuestion[];
  mapping: FormMapping;
  definitions: readonly PlaybookField[];
}): FormAnswers {
  const byName = new Map(input.fieldData.map((item) => [item.name, item.values[0] ?? '']));
  const fullName =
    byName.get('full_name') ||
    [byName.get('first_name'), byName.get('last_name')].filter(Boolean).join(' ');
  const fields: LeadFields = {};
  const other: FormAnswers['other'] = [];

  for (const item of input.fieldData) {
    if (['full_name', 'first_name', 'last_name', 'phone_number'].includes(item.name)) continue;
    const question = input.questions.find((candidate) => candidate.key === item.name);
    const value = readable(item.values[0] ?? '', question);
    if (!value) continue;
    const target = input.mapping[item.name];
    const field = target
      ? input.definitions.find((candidate) => candidate.key === target)
      : undefined;
    const normalised = field ? normaliseFieldValue(field, value) : null;
    if (field && normalised !== null) fields[field.key] = normalised;
    else other.push({ label: question?.label ?? item.name.replace(/_/g, ' '), value });
  }

  return {
    name: fullName?.trim() || null,
    phone: byName.get('phone_number')?.trim() || null,
    fields,
    other,
  };
}
