import { z } from 'zod';

/** Page size for server-side (keyset) pagination: 1–100, default 25. */
export const pageLimitSchema = z.coerce.number().int().min(1).max(100).default(25);
/** Opaque cursor returned by the previous page. */
export const cursorSchema = z.string().min(1).max(500);

/** GET /api/meta-leads — every Meta lead form submission, exactly as received. */
export const metaLeadsQuerySchema = z.object({
  /** Local dates (YYYY-MM-DD) in `tz`, inclusive. Default: the last 30 days. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  tz: z.string().max(64).optional(),
  formId: z.string().max(64).optional(),
  limit: pageLimitSchema,
  cursor: cursorSchema.optional(),
});
export type MetaLeadsQuery = z.infer<typeof metaLeadsQuerySchema>;

export const metaLeadItemSchema = z.object({
  id: z.uuid(),
  receivedAt: z.iso.datetime({ offset: true }),
  leadgenId: z.string(),
  formId: z.string(),
  formName: z.string().nullable(),
  pageId: z.string(),
  pageName: z.string().nullable(),
  adId: z.string().nullable(),
  /** The lead it created or updated (null when the submission had no valid phone). */
  lead: z.object({ id: z.uuid(), name: z.string().nullable(), phone: z.string() }).nullable(),
  /** Meta's field_data as name → values (field names as sent, every value as text). */
  fields: z.array(z.object({ name: z.string(), values: z.array(z.string()) })),
  /** field_data exactly as stored, whatever its shape. */
  rawFieldData: z.json(),
});
export type MetaLeadItem = z.infer<typeof metaLeadItemSchema>;

export const metaLeadsResponseSchema = z.object({
  items: z.array(metaLeadItemSchema),
  /** Cursor for the next (older) page, or null on the last page. */
  nextCursor: z.string().nullable(),
  /** Submissions matching the filters (all pages). */
  total: z.number().int(),
  from: z.iso.date(),
  to: z.iso.date(),
  /** Forms with submissions in the date range, for the form filter. */
  forms: z.array(
    z.object({ formId: z.string(), formName: z.string().nullable(), count: z.number().int() }),
  ),
});
export type MetaLeadsResponse = z.infer<typeof metaLeadsResponseSchema>;
