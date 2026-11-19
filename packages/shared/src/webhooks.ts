import { z } from 'zod';
import { leadAttributionSchema, leadGradeSchema } from './lead.js';
import { cursorSchema } from './meta-leads.js';

/** Lead events a workspace can receive on its webhook endpoints. */
export const webhookEventTypeSchema = z.enum([
  'lead.created',
  'lead.qualified',
  'lead.handoff',
  'lead.disqualified',
  'lead.unresponsive',
  'lead.undeliverable',
]);
export type WebhookEventType = z.infer<typeof webhookEventTypeSchema>;

export const WEBHOOK_EVENT_LABELS: Record<WebhookEventType, string> = {
  'lead.created': 'New lead',
  'lead.qualified': 'Lead qualified',
  'lead.handoff': 'Handed off to the team',
  'lead.disqualified': 'Not a fit',
  'lead.unresponsive': 'No reply after follow-ups',
  'lead.undeliverable': 'Not reachable on WhatsApp',
};

/** Queue job: something happened to a lead; the worker fans it out to subscribed endpoints. */
export const LEAD_EVENTS_QUEUE = 'lead-events';
export const leadEventJobSchema = z.object({
  tenantId: z.string().min(1),
  leadId: z.uuid(),
  type: webhookEventTypeSchema,
  at: z.iso.datetime(),
});
export type LeadEventJob = z.infer<typeof leadEventJobSchema>;

/** Queue job: deliver one stored webhook delivery (retried with backoff). */
export const WEBHOOK_DELIVERY_QUEUE = 'webhook-delivery';
export const webhookDeliveryJobSchema = z.object({
  tenantId: z.string().min(1),
  deliveryId: z.uuid(),
});
export type WebhookDeliveryJob = z.infer<typeof webhookDeliveryJobSchema>;

/** Retry schedule: 30 s, 1, 2, 4, 8, 16, 32, 64 min (about 2 h in total). */
export const WEBHOOK_DELIVERY_ATTEMPTS = 8;
export const WEBHOOK_DELIVERY_BACKOFF_MS = 30_000;

/**
 * The JSON body we POST. Signed with the endpoint secret:
 * `X-Qualify-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">`.
 * `id` is the event id: the same on every retry and resend, so receivers can deduplicate.
 */
export const webhookPayloadSchema = z.object({
  id: z.uuid(),
  type: z.union([webhookEventTypeSchema, z.literal('webhook.test')]),
  createdAt: z.iso.datetime(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  lead: z.object({
    id: z.uuid(),
    name: z.string().nullable(),
    phone: z.string(),
    source: z.string(),
    sourceLabel: z.string(),
    status: z.string(),
    statusLabel: z.string(),
    grade: leadGradeSchema.nullable(),
    score: z.number().int().nullable(),
    scoreReason: z.string().nullable(),
    summary: z.string().nullable(),
    /**
     * Answers to the AI agent's questions, in question order. `confirmed` is false for an answer
     * that came with the lead (form / API) and the lead hasn't confirmed in the chat yet.
     */
    answers: z.array(
      z.object({ key: z.string(), label: z.string(), value: z.string(), confirmed: z.boolean() }),
    ),
    /** Answers that are not (or no longer) questions of the agent. */
    otherAnswers: z.record(z.string(), z.string()),
    attribution: leadAttributionSchema.nullable(),
    createdAt: z.iso.datetime(),
    qualifiedAt: z.iso.datetime().nullable(),
    handoffAt: z.iso.datetime().nullable(),
    conversationUrl: z.string(),
  }),
});
export type WebhookPayload = z.infer<typeof webhookPayloadSchema>;

/** Only send leads with these grades (empty/absent = every lead). */
export const webhookGradesSchema = z.array(z.union([leadGradeSchema, z.literal('none')])).max(5);

export const webhookUrlSchema = z
  .url({ protocol: /^https?$/ })
  .max(500, 'Use a URL of at most 500 characters');

export const createWebhookSchema = z.object({
  url: webhookUrlSchema,
  description: z.string().trim().max(100).optional(),
  events: z.array(webhookEventTypeSchema).min(1, 'Pick at least one event').max(10),
  grades: webhookGradesSchema.default([]),
});
export type CreateWebhook = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = createWebhookSchema
  .partial()
  .extend({ active: z.boolean().optional() });
export type UpdateWebhook = z.infer<typeof updateWebhookSchema>;

export const webhookEndpointSchema = z.object({
  id: z.uuid(),
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(webhookEventTypeSchema),
  grades: webhookGradesSchema,
  active: z.boolean(),
  /** First characters of the secret, to tell secrets apart. */
  secretHint: z.string(),
  createdAt: z.iso.datetime(),
  lastSuccessAt: z.iso.datetime().nullable(),
  lastFailureAt: z.iso.datetime().nullable(),
});
export type WebhookEndpoint = z.infer<typeof webhookEndpointSchema>;

export const webhookListSchema = z.object({ endpoints: z.array(webhookEndpointSchema) });

/** Returned once on create and on secret rotation. */
export const webhookWithSecretSchema = z.object({
  endpoint: webhookEndpointSchema,
  secret: z.string(),
});
export type WebhookWithSecret = z.infer<typeof webhookWithSecretSchema>;

export const webhookDeliveryStatusSchema = z.enum(['pending', 'succeeded', 'failed']);

export const webhookDeliverySchema = z.object({
  id: z.uuid(),
  eventId: z.uuid(),
  eventType: z.string(),
  leadId: z.uuid().nullable(),
  leadName: z.string().nullable(),
  status: webhookDeliveryStatusSchema,
  attempts: z.number().int(),
  responseStatus: z.number().int().nullable(),
  responseExcerpt: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.iso.datetime(),
  deliveredAt: z.iso.datetime().nullable(),
  nextAttemptAt: z.iso.datetime().nullable(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const webhookDeliveriesQuerySchema = z.object({ cursor: cursorSchema.optional() });
export const webhookDeliveriesSchema = z.object({
  deliveries: z.array(webhookDeliverySchema),
  nextCursor: z.string().nullable(),
});
