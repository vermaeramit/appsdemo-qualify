import type {
  AgentLanguage,
  AgentTurn,
  LeadSignals,
  LeadStatus,
  PlaybookField,
  PrefillConfirmation,
} from '@qualify/shared';
import { isQualificationComplete, type LeadFields, mergeExtractedFields } from './fields.ts';
import { chooseReplyOptions, type ReplyOptions } from './interactive.ts';
import { clampSignal, sanitizeReply } from './policy.ts';
import { answersToConfirm, remainingUnconfirmed } from './prefill.ts';

const CLOSED_STATUSES = new Set(['qualified', 'handoff', 'disqualified']);
/** Before the first real exchange: a lead who wrote in (new) or got our opening (contacting). */
// A lead we couldn't reach who writes to us is reachable after all.
const OPENING_STATUSES = new Set(['new', 'contacting', 'undeliverable']);

export interface AppliedTurn {
  fields: LeadFields;
  changed: string[];
  rejected: { key: string; value: string; reason: string }[];
  /** Answers that came with the lead and are still not confirmed (D-089). */
  unconfirmed: string[];
  /** Keys the lead confirmed (or restated) in this turn. */
  confirmed: string[];
  status: LeadStatus;
  /** True when a human must take over (handoff). */
  aiPaused: boolean;
  becameQualified: boolean;
  handedOff: boolean;
  reply: string;
  /** Buttons / list for the reply (only while still qualifying). */
  options: ReplyOptions;
  signals: LeadSignals;
  language: AgentLanguage | null;
}

/**
 * Applies one model turn to a lead's state. Pure, and shared by the live respond job and the
 * eval harness, so evals measure exactly what production does.
 */
export function applyAgentTurn(
  definitions: readonly PlaybookField[],
  lead: {
    fields: LeadFields;
    status: string;
    signals?: LeadSignals | null;
    unconfirmed?: readonly string[];
  },
  turn: AgentTurn,
  replyLanguage: AgentLanguage = 'en',
  confirmMode: PrefillConfirmation = 'off',
): AppliedTurn {
  const merged = mergeExtractedFields(definitions, lead.fields, turn.extracted);
  // A confirmed answer, or one the lead stated again in the chat, no longer needs confirming.
  const before = lead.unconfirmed ?? [];
  const rejectedKeys = new Set(merged.rejected.map((item) => item.key));
  const stated = turn.extracted.map((item) => item.key).filter((key) => !rejectedKeys.has(key));
  const unconfirmed = remainingUnconfirmed(before, [...turn.confirmed, ...stated]);
  const confirmed = before.filter((key) => !unconfirmed.includes(key));
  const toConfirm = answersToConfirm(definitions, merged.fields, unconfirmed, confirmMode);
  // Once the lead reached an end state, follow-up chit-chat ("thanks", "ok") must not
  // overwrite the intent signals captured while qualifying.
  const keepSignals = CLOSED_STATUSES.has(lead.status) && lead.signals != null;
  let status = lead.status as LeadStatus;
  let aiPaused = false;
  let becameQualified = false;
  let handedOff = false;

  if (turn.disqualified.value) {
    status = 'disqualified';
  } else if (turn.handoff.requested) {
    status = 'handoff';
    aiPaused = true;
    handedOff = true;
  } else if (isQualificationComplete(definitions, merged.fields) && toConfirm.length === 0) {
    becameQualified = status !== 'qualified';
    status = 'qualified';
  } else if (OPENING_STATUSES.has(status)) {
    status = 'engaged';
  }

  const language = turn.language === 'other' ? null : turn.language;
  return {
    fields: merged.fields,
    changed: merged.changed,
    rejected: merged.rejected,
    unconfirmed,
    confirmed,
    status,
    aiPaused,
    becameQualified,
    handedOff,
    reply: sanitizeReply(turn.reply),
    options: chooseReplyOptions({
      definitions,
      askingField: turn.askingField,
      // Only keys that really wait for confirmation get the confirm buttons.
      confirming: answersToConfirm(definitions, lead.fields, before, confirmMode)
        .map((field) => field.key)
        .filter((key) => turn.confirming.includes(key)),
      confirmMode,
      status,
      language: replyLanguage,
      suggested: turn.quickReplies,
    }),
    signals:
      keepSignals && lead.signals
        ? lead.signals
        : {
            urgency: clampSignal(turn.signals.urgency),
            seriousness: clampSignal(turn.signals.seriousness),
            buyingSignals: clampSignal(turn.signals.buyingSignals),
            note: turn.signals.note.slice(0, 300),
          },
    language,
  };
}
