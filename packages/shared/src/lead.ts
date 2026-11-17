import { z } from 'zod';

/** Lead grade shown on badges, exported to Excel and sent in webhooks. */
export const leadGradeSchema = z.enum(['hot', 'warm', 'cold', 'disqualified']);
export type LeadGrade = z.infer<typeof leadGradeSchema>;

/** Lead score is always an integer from 0 to 100 (rule points + AI intent points). */
export const leadScoreSchema = z.number().int().min(0).max(100);
export type LeadScore = z.infer<typeof leadScoreSchema>;
