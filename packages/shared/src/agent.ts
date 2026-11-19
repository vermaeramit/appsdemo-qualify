import { z } from 'zod';

/**
 * Structured output of ONE agent turn (D-007 / ARCHITECTURE §7.3).
 * Kept compatible with OpenAI strict JSON schema: every property required, nullable instead of
 * optional, no length/range keywords. Code validates and clamps after parsing.
 */
export const agentTurnSchema = z.object({
  /** Language the lead is writing in. */
  language: z.enum(['hinglish', 'en', 'hi', 'other']),
  /** The WhatsApp message to send (short, one question at most). */
  reply: z.string(),
  /** Up to 3 tap-to-answer options (≤20 chars each); empty when free text is better. */
  quickReplies: z.array(z.string()),
  /** Key of the field this reply asks about (null if none). For choice / yes-no questions the app shows the configured options. */
  askingField: z.string().nullable(),
  /** Field values learnt from the lead's latest messages, normalised to English. */
  extracted: z.array(z.object({ key: z.string(), value: z.string() })),
  /** Keys of answers from the "to confirm" list that this reply asks the lead to confirm (D-089). */
  confirming: z.array(z.string()),
  /** Keys of answers from the "to confirm" list the lead confirmed as correct in their latest messages. */
  confirmed: z.array(z.string()),
  /** 0–10 each. */
  signals: z.object({
    urgency: z.number(),
    seriousness: z.number(),
    buyingSignals: z.number(),
    note: z.string(),
  }),
  handoff: z.object({ requested: z.boolean(), reason: z.string().nullable() }),
  disqualified: z.object({ value: z.boolean(), reason: z.string().nullable() }),
});
export type AgentTurn = z.infer<typeof agentTurnSchema>;

/** The part of a stored AI message's payload that says which answers it asked to confirm. */
export const storedConfirmingSchema = z.object({ confirming: z.array(z.string()).max(50) });

export const leadStatusSchema = z.enum([
  'new',
  /** We sent the opening (form/API lead) and are waiting for the first reply. */
  'contacting',
  'engaged',
  'qualified',
  'disqualified',
  'handoff',
  'unresponsive',
  /** Our opening failed with Meta's "undeliverable" error and the lead never wrote to us. */
  'undeliverable',
]);
export type LeadStatus = z.infer<typeof leadStatusSchema>;

export const leadSignalsSchema = z.object({
  urgency: z.number().int().min(0).max(10),
  seriousness: z.number().int().min(0).max(10),
  buyingSignals: z.number().int().min(0).max(10),
  note: z.string(),
});
export type LeadSignals = z.infer<typeof leadSignalsSchema>;

/** LLM output: which playbook question (key) each lead form question answers, or null. */
export const formMappingOutputSchema = z.object({
  mappings: z.array(z.object({ formKey: z.string(), fieldKey: z.string().nullable() })),
});
export type FormMappingOutput = z.infer<typeof formMappingOutputSchema>;
