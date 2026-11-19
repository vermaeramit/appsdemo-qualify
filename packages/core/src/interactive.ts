import type { AgentLanguage, PlaybookField, PrefillConfirmation } from '@qualify/shared';
import { sanitizeQuickReplies } from './policy.ts';

/** How the agent's reply is presented on WhatsApp. */
export type ReplyOptions =
  | { kind: 'none' }
  | { kind: 'buttons'; buttons: string[] }
  | { kind: 'list'; buttonLabel: string; rows: string[] };

const MAX_BUTTONS = 3;
const MAX_BUTTON_TITLE = 20;
const MAX_LIST_ROWS = 10;

const YES_NO: Record<AgentLanguage, [string, string]> = {
  en: ['Yes', 'No'],
  hinglish: ['Haan', 'Nahi'],
  hi: ['हाँ', 'नहीं'],
};

/** Answers to "is this what you filled in?" (D-089). */
const CONFIRM_ALL: Record<AgentLanguage, [string, string]> = {
  en: ['Yes, correct', 'Change something'],
  hinglish: ['Haan, sahi hai', 'Kuch badalna hai'],
  hi: ['हाँ, सही है', 'कुछ बदलना है'],
};

const LIST_BUTTON: Record<AgentLanguage, string> = {
  en: 'Choose',
  hinglish: 'Choose karein',
  hi: 'चुनें',
};

/**
 * Picks the WhatsApp presentation for a reply:
 * - the reply confirms answers that came with the lead → "Yes, correct / Change something" for
 *   several (or in "together" mode), Yes/No for one at a time;
 * - the question is about a `choice` field → its configured options (≤3 short ones as buttons,
 *   otherwise a list menu of up to 10);
 * - a `yes_no` field → Yes/No buttons in the lead's language;
 * - a plain question → the model's suggested quick replies (if any) as buttons.
 * Only while the lead is still being qualified.
 */
export function chooseReplyOptions(input: {
  definitions: readonly PlaybookField[];
  askingField: string | null;
  /** Keys this reply asks the lead to confirm. */
  confirming?: readonly string[];
  confirmMode?: PrefillConfirmation;
  status: string;
  language: AgentLanguage;
  suggested: readonly string[];
}): ReplyOptions {
  if (input.status !== 'engaged') return { kind: 'none' };
  const confirming = input.confirming ?? [];
  if (confirming.length > 0) {
    const oneByOne = input.confirmMode === 'one_by_one' && confirming.length === 1;
    return {
      kind: 'buttons',
      buttons: [...(oneByOne ? YES_NO : CONFIRM_ALL)[input.language]],
    };
  }
  const field = input.askingField
    ? input.definitions.find((candidate) => candidate.key === input.askingField)
    : undefined;

  if (field?.type === 'choice' && field.options?.length) {
    const options = field.options.slice(0, MAX_LIST_ROWS);
    const fitsButtons =
      options.length <= MAX_BUTTONS && options.every((option) => option.length <= MAX_BUTTON_TITLE);
    return fitsButtons
      ? { kind: 'buttons', buttons: options }
      : { kind: 'list', buttonLabel: LIST_BUTTON[input.language], rows: options };
  }
  if (field?.type === 'yes_no') {
    return { kind: 'buttons', buttons: [...YES_NO[input.language]] };
  }

  const suggested = sanitizeQuickReplies(input.suggested);
  return suggested.length ? { kind: 'buttons', buttons: suggested } : { kind: 'none' };
}

/** Flat list of option titles (for storing and showing in the inbox / eval transcripts). */
export function optionTitles(options: ReplyOptions): string[] {
  if (options.kind === 'buttons') return options.buttons;
  if (options.kind === 'list') return options.rows;
  return [];
}
