import { z } from 'zod';

/** BullMQ queue names. Producers (api) and consumers (worker) must use these constants. */
export const QUEUES = {
  /** Raw Meta webhook events, persisted by the api and processed by the worker. */
  metaEvents: 'meta-events',
} as const;

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
