import { z } from 'zod';
import { leadStatusSchema } from './agent.js';
import { leadGradeSchema } from './lead.js';
import { agentLanguageSchema, playbookConfigSchema } from './playbook.js';

/**
 * POST /api/playbook/simulate — one agent turn on a test chat (nothing is sent on WhatsApp and
 * nothing is stored). `config` is the editor's draft; without it the published version is used.
 */
export const simulateRequestSchema = z.object({
  config: playbookConfigSchema.optional(),
  messages: z
    .array(
      z.object({
        from: z.enum(['lead', 'agent']),
        text: z.string().trim().min(1).max(1_000),
      }),
    )
    .min(1)
    .max(40),
  fields: z.record(z.string(), z.string().max(300)).default({}),
  /** Keys of `fields` that came with the lead (a form) and aren't confirmed yet (D-089). */
  unconfirmed: z.array(z.string()).max(20).default([]),
  /** Keys the previous agent reply asked the lead to confirm (its response's `confirming`). */
  asked: z.array(z.string()).max(20).default([]),
  status: leadStatusSchema.default('new'),
  language: agentLanguageSchema.nullable().default(null),
});
export type SimulateRequest = z.infer<typeof simulateRequestSchema>;

/** How the reply is presented on WhatsApp (core `ReplyOptions`). */
export const replyOptionsSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('buttons'), buttons: z.array(z.string()) }),
  z.object({ kind: z.literal('list'), buttonLabel: z.string(), rows: z.array(z.string()) }),
]);

export const simulateResponseSchema = z.object({
  reply: z.string(),
  options: replyOptionsSchema,
  fields: z.record(z.string(), z.string()),
  unconfirmed: z.array(z.string()),
  /** Keys the lead just confirmed. */
  confirmed: z.array(z.string()),
  /** Keys this reply asks the lead to confirm: send them back as `asked` with the next turn. */
  confirming: z.array(z.string()),
  changed: z.array(z.string()),
  rejected: z.array(z.object({ key: z.string(), value: z.string(), reason: z.string() })),
  status: leadStatusSchema,
  language: agentLanguageSchema.nullable(),
  score: z
    .object({ score: z.number().int(), grade: leadGradeSchema, reason: z.string() })
    .nullable(),
  usage: z.object({
    model: z.string(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number().nullable(),
    latencyMs: z.number(),
  }),
});
export type SimulateResponse = z.infer<typeof simulateResponseSchema>;
