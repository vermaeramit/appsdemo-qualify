import {
  type PlaybookConfig,
  type PlaybookField,
  type PrefillConfirmation,
  storedConfirmingSchema,
} from '@qualify/shared';
import type { LeadFields } from './fields.ts';

/** Keys a stored message asked the lead to confirm (none for templates and human replies). */
export function confirmingIn(payload: unknown): string[] {
  const parsed = storedConfirmingSchema.safeParse(payload);
  return parsed.success ? parsed.data.confirming : [];
}

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

/**
 * Keys a reply really asks the lead to confirm: the ones the model says it is confirming that
 * still wait for confirmation. Only these get the confirm buttons, and only these can be
 * confirmed by the lead's next answer.
 */
export function confirmationAsked(
  definitions: readonly PlaybookField[],
  fields: LeadFields,
  unconfirmed: readonly string[],
  mode: PrefillConfirmation,
  modelConfirming: readonly string[],
): string[] {
  const claimed = new Set(modelConfirming);
  return answersToConfirm(definitions, fields, unconfirmed, mode)
    .map((field) => field.key)
    .filter((key) => claimed.has(key));
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
