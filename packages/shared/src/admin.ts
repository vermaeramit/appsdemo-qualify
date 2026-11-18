import { z } from 'zod';

/** GET /api/admin/overview — platform operator view across workspaces (M7). */
export const adminOverviewSchema = z.object({
  workspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      createdAt: z.iso.datetime(),
      members: z.number().int(),
      leadsTotal: z.number().int(),
      leads30d: z.number().int(),
      qualified30d: z.number().int(),
      messages30d: z.number().int(),
      aiReplies30d: z.number().int(),
      lastMessageAt: z.iso.datetime().nullable(),
      phone: z.string().nullable(),
      qualityRating: z.string().nullable(),
      webhooks: z.number().int(),
    }),
  ),
  queues: z.array(
    z.object({
      name: z.string(),
      waiting: z.number().int(),
      active: z.number().int(),
      delayed: z.number().int(),
      failed: z.number().int(),
    }),
  ),
  checkedAt: z.iso.datetime(),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;
