import type { PlaybookConfig, PlaybookField, PrefillConfirmation } from '@qualify/shared';
import type { LeadFields } from './fields.ts';

/**
 * Answers that came with the lead (a Meta lead form, a website form through the API) are often
 * tapped in a hurry. The agent confirms them in the chat before relying on them (D-089).
 */
export function prefillMode(
  config: Pick<PlaybookConfig, 'prefillConfirmation'>,
): PrefillConfirmation {
  return config.prefillConfirmation ?? 'together';
}

/** Whether this question's answer is confirmed when it came with the lead (default: required). */
export function confirmsWhenPrefilled(field: PlaybookField): boolean {
  return field.confirmWhenPrefilled ?? field.required;
}

/** Answers the agent must still confirm, in the order they are asked. */
export function answersToConfirm(
  definitions: readonly PlaybookField[],
  fields: LeadFields,
  unconfirmed: readonly string[],
  mode: PrefillConfirmation,
): PlaybookField[] {
  if (mode === 'off' || unconfirmed.length === 0) return [];
  const pending = new Set(unconfirmed);
  return definitions
    .filter((field) => pending.has(field.key) && fields[field.key] && confirmsWhenPrefilled(field))
    .sort((a, b) => a.priority - b.priority);
}

/** Keys still unconfirmed after the lead confirmed some, or stated the values themselves. */
export function remainingUnconfirmed(
  unconfirmed: readonly string[],
  settled: Iterable<string>,
): string[] {
  const done = new Set(settled);
  return unconfirmed.filter((key) => !done.has(key));
}

/** Keys of answers that came with an enquiry, to add to the lead's unconfirmed list. */
export function mergeUnconfirmed(
  current: readonly string[],
  incoming: Record<string, string>,
): string[] {
  return [...new Set([...current, ...Object.keys(incoming).filter((key) => incoming[key])])];
}
