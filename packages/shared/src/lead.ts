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
