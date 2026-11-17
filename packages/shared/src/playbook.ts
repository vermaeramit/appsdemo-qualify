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

/** One piece of information the agent must (or may) collect. */
export const playbookFieldSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'lowercase letters, digits and _'),
  label: z.string().min(1).max(60),
  type: fieldTypeSchema,
  required: z.boolean(),
  /** Lower = asked earlier. */
  priority: z.number().int().min(1).max(99),
  /** For `choice` fields. Stored values are normalised to one of these. */
  options: z.array(z.string().min(1).max(40)).max(10).optional(),
  /** How to ask / interpret / normalise. Written by the tenant. */
  guidance: z.string().max(500).optional(),
});
export type PlaybookField = z.infer<typeof playbookFieldSchema>;

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
});
export type PlaybookConfig = z.infer<typeof playbookConfigSchema>;
