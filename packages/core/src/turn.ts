import type { AgentTurn, LeadSignals, LeadStatus, PlaybookField } from '@qualify/shared';
import { isQualificationComplete, type LeadFields, mergeExtractedFields } from './fields.ts';
import { clampSignal, sanitizeQuickReplies, sanitizeReply } from './policy.ts';

const CLOSED_STATUSES = new Set(['qualified', 'handoff', 'disqualified']);

export interface AppliedTurn {
  fields: LeadFields;
  changed: string[];
  rejected: { key: string; value: string; reason: string }[];
  status: LeadStatus;
  /** True when a human must take over (handoff). */
  aiPaused: boolean;
  becameQualified: boolean;
  handedOff: boolean;
  reply: string;
  /** Only offered while still qualifying. */
  quickReplies: string[];
  signals: LeadSignals;
  language: 'hinglish' | 'en' | 'hi' | null;
}

/**
 * Applies one model turn to a lead's state. Pure, and shared by the live respond job and the
 * eval harness, so evals measure exactly what production does.
 */
export function applyAgentTurn(
  definitions: readonly PlaybookField[],
  lead: { fields: LeadFields; status: string; signals?: LeadSignals | null },
  turn: AgentTurn,
): AppliedTurn {
  const merged = mergeExtractedFields(definitions, lead.fields, turn.extracted);
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
  } else if (isQualificationComplete(definitions, merged.fields)) {
    becameQualified = status !== 'qualified';
    status = 'qualified';
  } else if (status === 'new') {
    status = 'engaged';
  }

  return {
    fields: merged.fields,
    changed: merged.changed,
    rejected: merged.rejected,
    status,
    aiPaused,
    becameQualified,
    handedOff,
    reply: sanitizeReply(turn.reply),
    quickReplies: status === 'engaged' ? sanitizeQuickReplies(turn.quickReplies) : [],
    signals:
      keepSignals && lead.signals
        ? lead.signals
        : {
            urgency: clampSignal(turn.signals.urgency),
            seriousness: clampSignal(turn.signals.seriousness),
            buyingSignals: clampSignal(turn.signals.buyingSignals),
            note: turn.signals.note.slice(0, 300),
          },
    language: turn.language === 'other' ? null : turn.language,
  };
}
