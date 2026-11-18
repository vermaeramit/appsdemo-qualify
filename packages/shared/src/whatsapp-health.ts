import { z } from 'zod';

/** GET /api/whatsapp/health — the connected number as Meta reports it now (M6). */
export const whatsappHealthSchema = z.object({
  connected: z.boolean(),
  checkedAt: z.iso.datetime(),
  number: z
    .object({
      phoneNumberId: z.string(),
      displayPhone: z.string().nullable(),
      verifiedName: z.string().nullable(),
      /** GREEN / YELLOW / RED / UNKNOWN */
      qualityRating: z.string().nullable(),
      /** CONNECTED, FLAGGED, RESTRICTED, … */
      status: z.string().nullable(),
      /** Display name review: APPROVED, PENDING_REVIEW, DECLINED, … */
      nameStatus: z.string().nullable(),
      /** Business-initiated conversations per 24 h, e.g. TIER_2K. */
      messagingLimit: z.string().nullable(),
      throughput: z.string().nullable(),
      platform: z.string().nullable(),
    })
    .nullable(),
  account: z
    .object({
      name: z.string().nullable(),
      reviewStatus: z.string().nullable(),
      businessVerification: z.string().nullable(),
    })
    .nullable(),
  webhooksSubscribed: z.boolean().nullable(),
  /** Messages Meta refused in the last 24 h because of a payment problem (error 131042). */
  paymentFailures24h: z.number().int(),
  /** Where to fix things in Meta's tools (the client's own business account). */
  links: z.object({ whatsappManager: z.string().nullable(), billing: z.string() }),
  /** Plain-language problems to fix, most serious first. Empty = healthy. */
  problems: z.array(z.string()),
});
export type WhatsAppHealth = z.infer<typeof whatsappHealthSchema>;
