import { z } from 'zod';

/**
 * POST /api/v1/leads — create a lead from any source (website form, CRM, Postman; Meta lead
 * forms in M4). Authenticated with a workspace API key. The agent then sends the opening
 * message on WhatsApp.
 */
export const createLeadRequestSchema = z.object({
  /** With country code, any format: "+91 98123 45678", "919812345678". */
  phone: z
    .string()
    .trim()
    .regex(/^\+?[\d\s()-]+$/, 'Only digits, spaces, +, - and () are allowed')
    .refine((value) => {
      const digits = value.replace(/\D/g, '').length;
      return digits >= 10 && digits <= 15;
    }, 'Use a full number with country code (10–15 digits), e.g. +919812345678'),
  name: z.string().trim().min(1).max(120).optional(),
  source: z.enum(['api', 'meta_form']).default('api'),
  campaign: z.string().trim().max(200).optional(),
  /**
   * The agent that handles this lead (AI agents → Agent settings → Agent ID, D-097). Left out:
   * the agent its campaign is routed to, else the default agent.
   */
  agentId: z.uuid('Use an agent ID from AI agents → Agent settings').optional(),
  /** Answers the lead already gave (e.g. on a form), keyed by playbook field key. Never asked again. */
  fields: z
    .record(z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), z.string().trim().min(1).max(200))
    .optional(),
});
export type CreateLeadRequest = z.infer<typeof createLeadRequestSchema>;

export const createLeadResponseSchema = z.object({
  leadId: z.uuid(),
  isNewLead: z.boolean(),
  status: z.literal('queued'),
  /** Field keys that were not recognised by the playbook and were ignored. */
  ignoredFields: z.array(z.string()),
});
export type CreateLeadResponse = z.infer<typeof createLeadResponseSchema>;

/**
 * POST /api/v1/leads/:id/outcome — what happened after the hand-off (from the client's CRM).
 * Kept on the lead for reports and, later, to calibrate scoring against real results.
 */
export const leadOutcomeSchema = z.object({
  outcome: z.enum(['won', 'lost', 'in_progress', 'no_answer']),
  /** Deal value in the client's currency (optional). */
  value: z.number().nonnegative().max(1e12).optional(),
  currency: z.string().length(3).toUpperCase().optional(),
  note: z.string().trim().max(500).optional(),
});
export type LeadOutcomeRequest = z.infer<typeof leadOutcomeSchema>;

export const storedLeadOutcomeSchema = leadOutcomeSchema.extend({ at: z.iso.datetime() });
export type StoredLeadOutcome = z.infer<typeof storedLeadOutcomeSchema>;

export const LEAD_OUTCOME_LABELS: Record<LeadOutcomeRequest['outcome'], string> = {
  won: 'Won',
  lost: 'Lost',
  in_progress: 'In progress',
  no_answer: 'No answer',
};
