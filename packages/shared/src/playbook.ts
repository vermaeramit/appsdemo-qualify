import { z } from 'zod';

/** Languages the agent can speak. "hinglish" = Hindi written in Roman script. */
export const agentLanguageSchema = z.enum(['hinglish', 'en', 'hi']);
export type AgentLanguage = z.infer<typeof agentLanguageSchema>;

export const fieldTypeSchema = z.enum([
  'text',
  'choice',
  'number',
  'range',
  'date_month',
  'yes_no',
]);
export type FieldType = z.infer<typeof fieldTypeSchema>;

/**
 * One question the agent asks (one piece of information to collect).
 * - Questions WITH options: `choice` (3 options → WhatsApp buttons, 4–10 → list menu) or
 *   `yes_no` (Yes/No buttons in the lead's language).
 * - PLAIN questions: `text`, `number`, `range`, `date_month` → the lead types the answer.
 */
export const playbookFieldSchema = z
  .object({
    key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'lowercase letters, digits and _'),
    label: z.string().min(1).max(60),
    type: fieldTypeSchema,
    required: z.boolean(),
    /** Lower = asked earlier. */
    priority: z.number().int().min(1).max(99),
    /** Preferred wording of the question. The agent keeps its meaning and translates it to the lead's language. */
    question: z.string().min(1).max(300).optional(),
    /** For `choice` fields: the answers shown as buttons/list. Stored values are normalised to one of these. */
    options: z.array(z.string().min(1).max(24)).min(2).max(10).optional(),
    /** For `choice` fields: the lead may also type an answer that is not in the list. */
    allowOther: z.boolean().optional(),
    /** How to interpret / normalise answers. Written by the tenant. */
    guidance: z.string().max(500).optional(),
  })
  .refine((field) => field.type !== 'choice' || (field.options?.length ?? 0) >= 2, {
    message: 'choice questions need at least 2 options',
    path: ['options'],
  });
export type PlaybookField = z.infer<typeof playbookFieldSchema>;

/**
 * First message to a lead who came from a form or the API (business-initiated).
 * Outside the 24 h window WhatsApp only allows an approved template, so `bodyText` must match
 * the approved template exactly (it is also what we store and show to the AI as context).
 */
export const playbookOpeningSchema = z.object({
  /** Approved template name, or null when no template is approved yet. */
  templateName: z
    .string()
    .regex(/^[a-z0-9_]{1,512}$/)
    .nullable(),
  templateLanguage: z.string().min(2).max(10),
  /** Template body with {{1}}, {{2}}… placeholders. */
  bodyText: z.string().min(1).max(1024),
  /** What fills {{1}}, {{2}}…: "lead.firstName" | "lead.name" | "business.name" | "field:<key>" | "text:<literal>". */
  bodyParams: z.array(z.string().min(1).max(80)).max(10),
  /** Quick-reply buttons of the template (also used for free-form openings). */
  buttons: z.array(z.string().min(1).max(20)).max(3),
});
export type PlaybookOpening = z.infer<typeof playbookOpeningSchema>;

/** Hybrid playbook (D-007): structured fields + free-text rules + knowledge base. */
export const playbookConfigSchema = z.object({
  persona: z.object({
    name: z.string().min(1).max(40),
    role: z.string().min(1).max(120),
    tone: z.string().min(1).max(300),
    emoji: z.enum(['none', 'light', 'friendly']),
  }),
  business: z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(600),
  }),
  /** What "qualified" means for this business. */
  goal: z.string().min(1).max(500),
  fields: z.array(playbookFieldSchema).min(1).max(20),
  /** Guardrails in plain language. */
  rules: z.array(z.string().min(1).max(300)).max(30),
  /** Packages, prices ("starting from"), FAQs, policies. Injected into the cached prompt (D-015). */
  knowledgeBase: z.string().max(40_000),
  handoff: z.object({
    triggers: z.array(z.string().min(1).max(200)).max(10),
    message: z.string().min(1).max(500),
  }),
  closing: z.object({
    message: z.string().min(1).max(500),
    afterQualified: z.enum(['stop', 'answer_faqs']),
  }),
  /** Optional for playbooks created before M4; a default opening is used when missing. */
  opening: playbookOpeningSchema.optional(),
});
export type PlaybookConfig = z.infer<typeof playbookConfigSchema>;

/** Response of GET /api/v1/playbook and PUT /api/v1/playbook. */
export const playbookResponseSchema = z.object({
  playbookId: z.uuid(),
  versionId: z.uuid(),
  versionNo: z.number().int().positive(),
  config: playbookConfigSchema,
});
export type PlaybookResponse = z.infer<typeof playbookResponseSchema>;
