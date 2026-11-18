import { z } from 'zod';

/** Lead grade shown on badges, exported to Excel and sent in webhooks. */
export const leadGradeSchema = z.enum(['hot', 'warm', 'cold', 'disqualified']);
export type LeadGrade = z.infer<typeof leadGradeSchema>;

/** Lead score is always an integer from 0 to 100 (rule points + AI intent points). */
export const leadScoreSchema = z.number().int().min(0).max(100);
export type LeadScore = z.infer<typeof leadScoreSchema>;

/** One line of a score breakdown, e.g. "Timeline: Within a month" +22. */
export const scoreBreakdownItemSchema = z.object({
  label: z.string(),
  points: z.number().int(),
});

/** Stored on the lead after each AI turn (live) and at completion (final). */
export const leadScoreDetailsSchema = z.object({
  breakdown: z.array(scoreBreakdownItemSchema),
  rulePoints: z.number().int(),
  aiPoints: z.number().int(),
  reason: z.string(),
  final: z.boolean(),
  /** Token usage of the AI summary (counted on the Costs page). */
  summaryUsage: z
    .object({
      model: z.string(),
      inputTokens: z.number(),
      cachedInputTokens: z.number(),
      outputTokens: z.number(),
      /** When the summary was written (its cost belongs to that day). */
      at: z.iso.datetime(),
    })
    .optional(),
});
export type LeadScoreDetails = z.infer<typeof leadScoreDetailsSchema>;

/**
 * Where the lead's latest enquiry came from (last touch): a Click-to-WhatsApp ad, a Meta lead
 * form, or the API. Shown on the lead and sent in exports/webhooks (M7).
 */
export const leadAttributionSchema = z.object({
  channel: z.enum(['whatsapp_inbound', 'meta_form', 'ctwa', 'api']),
  at: z.iso.datetime(),
  /** Meta ad id (CTWA referral source_id for an ad, or the lead form's ad). */
  adId: z.string().max(64).optional(),
  /** CTWA referral: 'ad' or 'post', its URL, and the ad's headline and text as shown to the lead. */
  sourceType: z.string().max(32).optional(),
  sourceUrl: z.string().max(1000).optional(),
  headline: z.string().max(300).optional(),
  body: z.string().max(1000).optional(),
  /** Click id for the Conversions API (Phase 2). */
  ctwaClid: z.string().max(500).optional(),
  formId: z.string().max(64).optional(),
  formName: z.string().max(200).optional(),
  pageId: z.string().max(64).optional(),
  /** Free text from the API caller. */
  campaign: z.string().max(200).optional(),
});
export type LeadAttribution = z.infer<typeof leadAttributionSchema>;
