import { z } from 'zod';

/** BullMQ queue names. Producers (api) and consumers (worker) must use these constants. */
export const QUEUES = {
  /** Raw Meta webhook events, persisted by the api and processed by the worker. */
  metaEvents: 'meta-events',
} as const;

/** "Send the opening message to this new form/API lead" jobs. */
export const CONTACT_QUEUE = 'lead-contact';

export const contactJobSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.uuid(),
});
export type ContactJob = z.infer<typeof contactJobSchema>;

/** Follow-ups for leads who don't reply, and the final "No reply" check. */
export const FOLLOW_UP_QUEUE = 'lead-followup';

export const followUpJobSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.uuid(),
  kind: z.enum(['followup', 'unresponsive']),
  /** Index of the follow-up step (for "unresponsive": the number of follow-ups sent). */
  step: z.number().int().min(0),
  /** Our message it follows up on: if the lead's latest message is a different one, it is stale. */
  afterMessageId: z.uuid(),
});
export type FollowUpJob = z.infer<typeof followUpJobSchema>;

/** Debounced "the AI should answer this lead" jobs. */
export const RESPOND_QUEUE = 'lead-respond';

export const respondJobSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.uuid(),
});
export type RespondJob = z.infer<typeof respondJobSchema>;

export const metaEventJobSchema = z.object({
  /** inbound_meta_events.id */
  eventId: z.uuid(),
});
export type MetaEventJob = z.infer<typeof metaEventJobSchema>;

/** Recomputes every lead's score after the scoring config changes (batched in the worker). */
export const RESCORE_QUEUE = 'lead-rescore';

export const rescoreJobSchema = z.object({ tenantId: z.string().min(1) });
export type RescoreJob = z.infer<typeof rescoreJobSchema>;
