import { z } from 'zod';

/**
 * Activity log (D-091): what happened to each lead, step by step, so a team can answer "why
 * didn't the lead get a reply?" without server access. Written by the worker and the api,
 * shown per conversation and on the workspace Logs page. Kept for ACTIVITY_RETENTION_DAYS.
 */
export const ACTIVITY_SOURCES = [
  'whatsapp',
  'agent',
  'outreach',
  'lead',
  'webhook',
  'team',
] as const;
export const activitySourceSchema = z.enum(ACTIVITY_SOURCES);
export type ActivitySource = z.infer<typeof activitySourceSchema>;

export const ACTIVITY_SOURCE_LABELS: Record<ActivitySource, string> = {
  whatsapp: 'WhatsApp',
  agent: 'AI agent',
  outreach: 'Opening and follow-ups',
  lead: 'Leads',
  webhook: 'Webhooks',
  team: 'Team',
};

export const activityLevelSchema = z.enum(['info', 'warn', 'error']);
export type ActivityLevel = z.infer<typeof activityLevelSchema>;

/** Small facts shown under an entry, label → value (e.g. "Model": "gpt-5.4-mini"). */
export const activityDetailSchema = z.record(
  z.string().max(60),
  z.union([z.string().max(2_000), z.number(), z.boolean(), z.null()]),
);
export type ActivityDetail = z.infer<typeof activityDetailSchema>;

/** One entry to record. `message` is a short English sentence; details go in `detail`. */
export const activityInputSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.uuid().nullable().optional(),
  source: activitySourceSchema,
  /** Machine-readable event, e.g. `agent.replied`, `whatsapp.failed`. */
  kind: z.string().min(1).max(60),
  level: activityLevelSchema.default('info'),
  message: z.string().min(1).max(500),
  detail: activityDetailSchema.default({}),
});
export type ActivityInput = z.input<typeof activityInputSchema>;

export const activityEntrySchema = z.object({
  id: z.uuid(),
  at: z.string(),
  source: activitySourceSchema,
  kind: z.string(),
  level: activityLevelSchema,
  message: z.string(),
  detail: activityDetailSchema,
  lead: z.object({ id: z.uuid(), name: z.string().nullable(), phone: z.string() }).nullable(),
});
export type ActivityEntry = z.infer<typeof activityEntrySchema>;

export const activityPageSchema = z.object({
  items: z.array(activityEntrySchema),
  nextCursor: z.string().nullable(),
});
export type ActivityPage = z.infer<typeof activityPageSchema>;

/** GET /api/activity and /api/conversations/:leadId/activity. */
export const activityQuerySchema = z.object({
  /** One lead's timeline (any member); without it, the workspace feed (owners and managers). */
  leadId: z.uuid().optional(),
  source: activitySourceSchema.optional(),
  /** Only warnings and errors. */
  problems: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ActivityQuery = z.input<typeof activityQuerySchema>;

/**
 * Is Meta reaching us? Meta sends a webhook for every message we send (at least "sent"), so a
 * message sent minutes ago with no event from Meta since means the webhook isn't arriving.
 */
export const META_SILENCE_MINUTES = 5;

export const activityHealthSchema = z.object({
  number: z
    .object({
      phone: z.string().nullable(),
      /** Last webhook from Meta for this number (messages or statuses). */
      lastEventAt: z.string().nullable(),
    })
    .nullable(),
  /** Our last message accepted by Meta. */
  lastSentAt: z.string().nullable(),
  /** `no_number`: nothing connected; `silent`: we sent, Meta hasn't sent anything since. */
  problem: z.enum(['no_number', 'silent']).nullable(),
  last24h: z.object({ errors: z.number().int(), warnings: z.number().int() }),
});
export type ActivityHealth = z.infer<typeof activityHealthSchema>;

export const ACTIVITY_RETENTION_DAYS = 30;

/** Worker queue whose scheduler deletes entries older than ACTIVITY_RETENTION_DAYS. */
export const ACTIVITY_PRUNE_QUEUE = 'activity-prune';
