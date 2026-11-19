import { z } from 'zod';

export const emailSchema = z.email('Enter a valid email address').max(254);
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters');

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Enter your password'),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  name: z.string().trim().min(2, 'Enter your name').max(80),
  email: emailSchema,
  password: passwordSchema,
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60, 'Use at most 60 characters'),
  /** Playbook template key to start from (unknown keys fall back to "any business"). */
  template: z.string().min(1).max(40),
});
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

/**
 * Workspace roles. Stored with Better Auth's default role names; shown in the UI as
 * owner → Owner, admin → Manager, member → Viewer.
 */
export const workspaceRoleSchema = z.enum(['owner', 'admin', 'member']);
export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;

export const workspaceSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  role: workspaceRoleSchema,
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;

/** Set while a platform admin views this workspace through support access (D-092). */
export const supportAccessSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
  startedAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
});
export type SupportAccess = z.infer<typeof supportAccessSchema>;

/** Response of GET /api/me. */
export const meResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    /** Listed in PLATFORM_ADMIN_EMAILS: may open the admin page (M7). */
    isPlatformAdmin: z.boolean(),
  }),
  activeWorkspace: workspaceSummarySchema
    .extend({
      timezone: z.string(),
      defaultLanguage: z.string(),
      /** Read-only support view (the role is then "admin" for what it may see, never change). */
      support: supportAccessSchema.nullable(),
    })
    .nullable(),
  workspaces: z.array(workspaceSummarySchema),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
