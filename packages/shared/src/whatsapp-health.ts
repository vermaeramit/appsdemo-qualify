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
  /** Plain-language problems to fix, most serious first. Empty = healthy. */
  problems: z.array(z.string()),
});
export type WhatsAppHealth = z.infer<typeof whatsappHealthSchema>;
