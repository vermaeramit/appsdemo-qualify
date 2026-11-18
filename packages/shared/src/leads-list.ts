import { z } from 'zod';
import { leadStatusSchema } from './agent.js';
import { leadSourceSchema } from './dashboard.js';
import { leadGradeSchema } from './lead.js';
import { cursorSchema, pageLimitSchema } from './meta-leads.js';

/** "a,b,c" in a query string → validated list. */
const csv = <const V extends readonly string[]>(values: V) =>
  z
    .string()
    .max(300)
    .optional()
    .transform((value) => (value ? value.split(',').filter(Boolean) : undefined))
    .pipe(z.array(z.enum(values)).max(12).optional());

export const leadListSortSchema = z.enum(['newest', 'activity', 'score']);
export type LeadListSortOption = z.infer<typeof leadListSortSchema>;

/** Filters shared by GET /api/leads and the Excel export. */
export const leadFiltersSchema = z.object({
  /** Local dates (YYYY-MM-DD) in `tz`, inclusive, on the lead's creation. Default: last 30 days. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  tz: z.string().max(64).optional(),
  /** Name or phone contains this text. */
  q: z.string().trim().max(100).optional(),
  status: csv(leadStatusSchema.options),
  /** Grades; `none` = not scored yet. */
  grade: csv([...leadGradeSchema.options, 'none' as const]),
  source: csv(leadSourceSchema.options),
  sort: leadListSortSchema.default('newest'),
});
export type LeadFilters = z.infer<typeof leadFiltersSchema>;

export const leadListQuerySchema = leadFiltersSchema.extend({
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
});

export const leadListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  phone: z.string(),
  source: z.string(),
  status: z.string(),
  grade: leadGradeSchema.nullable(),
  score: z.number().int().nullable(),
  /** One line on why the score is what it is. */
  scoreReason: z.string().nullable(),
  /** Required questions answered / total (current playbook). */
  requiredDone: z.number().int(),
  requiredTotal: z.number().int(),
  /** Ad headline, form name or campaign of the latest enquiry. */
  origin: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastMessageAt: z.iso.datetime().nullable(),
});
export type LeadListItem = z.infer<typeof leadListItemSchema>;

export const leadListResponseSchema = z.object({
  items: z.array(leadListItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  from: z.iso.date(),
  to: z.iso.date(),
});
export type LeadListResponse = z.infer<typeof leadListResponseSchema>;

/** Words for statuses and sources (UI, Excel, webhooks). */
export const LEAD_STATUS_LABELS: Record<z.infer<typeof leadStatusSchema>, string> = {
  new: 'New',
  contacting: 'Contacted',
  engaged: 'Qualifying',
  qualified: 'Qualified',
  handoff: 'Handed off',
  disqualified: 'Not a fit',
  unresponsive: 'No reply',
  undeliverable: 'Undeliverable',
};

export const LEAD_SOURCE_LABELS: Record<z.infer<typeof leadSourceSchema>, string> = {
  whatsapp_inbound: 'WhatsApp chat',
  meta_form: 'Meta lead form',
  ctwa: 'Click-to-WhatsApp',
  api: 'Website / API',
};

/** DELETE /api/leads/:id — what was removed with the lead (D-085). */
export const leadDeletionSchema = z.object({
  messages: z.number().int(),
  formSubmissions: z.number().int(),
  webhookDeliveries: z.number().int(),
  auditEntriesRedacted: z.number().int(),
});
export type LeadDeletionResult = z.infer<typeof leadDeletionSchema>;
