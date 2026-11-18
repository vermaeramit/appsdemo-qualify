import { z } from 'zod';

/** Calendar periods in the viewer's time zone (today, the last 7 or 30 days including today). */
export const dashboardPeriodSchema = z.enum(['today', '7d', '30d']);
export type DashboardPeriod = z.infer<typeof dashboardPeriodSchema>;

export const leadSourceSchema = z.enum(['whatsapp_inbound', 'meta_form', 'ctwa', 'api']);
export type LeadSource = z.infer<typeof leadSourceSchema>;

/** GET /api/dashboard?period=…&tz=… — every number is computed from real data. */
export const dashboardResponseSchema = z.object({
  period: dashboardPeriodSchema,
  timezone: z.string(),
  /** Start of the period and the moment the numbers were computed (ISO). */
  from: z.iso.datetime({ offset: true }),
  generatedAt: z.iso.datetime({ offset: true }),
  kpis: z.object({
    /** Leads created in the period, and in the same span of the previous period. */
    newLeads: z.number().int(),
    previousNewLeads: z.number().int(),
    /** Of the leads created in the period: qualified so far / handed to the team. */
    qualified: z.number().int(),
    handoffs: z.number().int(),
    /** Of the leads created in the period: current grade counts. */
    grades: z.object({
      hot: z.number().int(),
      warm: z.number().int(),
      cold: z.number().int(),
      disqualified: z.number().int(),
      unscored: z.number().int(),
    }),
    /** Median time from a lead's first unanswered message to the AI reply. */
    medianReplySeconds: z.number().nullable(),
    replySamples: z.number().int(),
  }),
  /** New leads per bucket (hours for today, days otherwise), covering the whole period. */
  series: z.array(
    z.object({
      /** Local bucket start: "2026-11-18" or "2026-11-18T14". */
      bucket: z.string(),
      leads: z.number().int(),
      qualified: z.number().int(),
    }),
  ),
  bucket: z.enum(['hour', 'day']),
  /** Current status of the leads created in the period. */
  pipeline: z.array(z.object({ status: z.string(), count: z.number().int() })),
  sources: z.array(z.object({ source: leadSourceSchema, count: z.number().int() })),
  /** Leads with activity in the period, most recent first. */
  recentLeads: z.array(
    z.object({
      id: z.uuid(),
      name: z.string().nullable(),
      phone: z.string(),
      source: leadSourceSchema,
      status: z.string(),
      score: z.number().int().nullable(),
      grade: z.enum(['hot', 'warm', 'cold', 'disqualified']).nullable(),
      requiredAnswered: z.number().int(),
      requiredTotal: z.number().int(),
      /** First answers in question order, e.g. Destination: Dubai. */
      highlights: z.array(z.object({ label: z.string(), value: z.string() })),
      lastActivityAt: z.iso.datetime({ offset: true }),
    }),
  ),
  whatsapp: z
    .object({
      displayPhone: z.string(),
      displayName: z.string().nullable(),
      qualityRating: z.string().nullable(),
      isCoexistence: z.boolean(),
    })
    .nullable(),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;
