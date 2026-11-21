import { z } from 'zod';
import { adminWorkspaceAiSchema } from './ai.js';

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
      /** AI provider (D-094). */
      ai: adminWorkspaceAiSchema,
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

/**
 * Support access (D-092): a platform admin opens a client's workspace read-only, for a limited
 * time and with a reason. Every opening is recorded, and the workspace sees it in its Logs.
 */
export const SUPPORT_ACCESS_MINUTES = 60;
export const SUPPORT_READ_ONLY_MESSAGE = 'Support access is read-only';

/** POST /api/admin/support */
export const openSupportAccessSchema = z.object({
  workspaceId: z.string().min(1).max(100),
  reason: z
    .string()
    .trim()
    .min(5, 'Write why you need access (at least 5 characters)')
    .max(300, 'Use at most 300 characters'),
});
export type OpenSupportAccessInput = z.infer<typeof openSupportAccessSchema>;

export const supportSessionStateSchema = z.enum(['active', 'ended', 'expired']);
export type SupportSessionState = z.infer<typeof supportSessionStateSchema>;

/** One support access, for the admin page's history (GET /api/admin/support). */
export const supportSessionSchema = z.object({
  id: z.uuid(),
  workspace: z.object({ id: z.string(), name: z.string() }),
  admin: z.object({ name: z.string(), email: z.string() }),
  reason: z.string(),
  startedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  endedAt: z.iso.datetime().nullable(),
  state: supportSessionStateSchema,
  conversationsViewed: z.number().int(),
});
export type SupportSession = z.infer<typeof supportSessionSchema>;

export const supportHistorySchema = z.object({ items: z.array(supportSessionSchema) });
export type SupportHistory = z.infer<typeof supportHistorySchema>;
