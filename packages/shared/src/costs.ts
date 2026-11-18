import { z } from 'zod';

/** Billing-style periods in the viewer's time zone. */
export const costPeriodSchema = z.enum(['month', 'last_month', '7d', '30d']);
export type CostPeriod = z.infer<typeof costPeriodSchema>;

/** GET /api/costs?period=…&tz=… — what WhatsApp (Meta) and the AI cost the workspace. */
export const costsResponseSchema = z.object({
  period: costPeriodSchema,
  timezone: z.string(),
  from: z.iso.datetime({ offset: true }),
  to: z.iso.datetime({ offset: true }),
  generatedAt: z.iso.datetime({ offset: true }),
  /** For cost per lead: leads created in the period, and how many of them qualified. */
  leads: z.object({ newLeads: z.number().int(), qualified: z.number().int() }),
  /** As billed by Meta (pricing analytics), in the WhatsApp account's currency, before taxes. */
  meta: z.object({
    status: z.enum(['ok', 'not_connected', 'error']),
    message: z.string().nullable(),
    currency: z.string().nullable(),
    totalCost: z.number(),
    billableMessages: z.number().int(),
    freeMessages: z.number().int(),
    breakdown: z.array(
      z.object({
        category: z.string(),
        pricingType: z.string(),
        volume: z.number().int(),
        cost: z.number(),
      }),
    ),
    daily: z.array(z.object({ day: z.string(), cost: z.number(), volume: z.number().int() })),
  }),
  /** Estimated from each AI reply's token usage × the model's list price (USD). */
  ai: z.object({
    totalUsd: z.number(),
    replies: z.number().int(),
    /** Replies whose model has no known price (not included in the total). */
    unpricedReplies: z.number().int(),
    inputTokens: z.number().int(),
    cachedInputTokens: z.number().int(),
    outputTokens: z.number().int(),
    byModel: z.array(
      z.object({
        model: z.string(),
        replies: z.number().int(),
        inputTokens: z.number().int(),
        cachedInputTokens: z.number().int(),
        outputTokens: z.number().int(),
        costUsd: z.number().nullable(),
      }),
    ),
    daily: z.array(z.object({ day: z.string(), costUsd: z.number(), replies: z.number().int() })),
    pricesAsOf: z.string(),
  }),
  /** Messages Meta marked billable (from delivery webhooks), most recent first. */
  billable: z.array(
    z.object({
      messageId: z.uuid(),
      leadId: z.uuid(),
      leadName: z.string().nullable(),
      phone: z.string(),
      category: z.string(),
      templateName: z.string().nullable(),
      sentAt: z.iso.datetime({ offset: true }),
    }),
  ),
});
export type CostsResponse = z.infer<typeof costsResponseSchema>;
