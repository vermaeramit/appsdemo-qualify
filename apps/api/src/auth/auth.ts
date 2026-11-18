import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { findTemplate } from '@qualify/core';
import {
  account,
  auditLogs,
  createPublishedPlaybook,
  eq,
  invitation,
  member,
  organization as organizationTable,
  session,
  tenants,
  user,
  verification,
  withTenant,
  type Database,
} from '@qualify/db';
import type { Env } from '../config/env';

/**
 * Better Auth: email/password sign-in with cookie sessions, and the organization plugin
 * where one organization = one tenant (workspace).
 * Keep the plugin list in sync with better-auth.cli.ts (used to generate the schema).
 */
/** The template key from organization metadata (stored as JSON text or an object). */
function templateKeyOf(metadata: unknown): string | null {
  try {
    const value: unknown = typeof metadata === 'string' ? JSON.parse(metadata) : metadata;
    if (value && typeof value === 'object' && 'template' in value) {
      const key = (value as { template: unknown }).template;
      return typeof key === 'string' ? key : null;
    }
  } catch {
    // Not JSON: no template chosen.
  }
  return null;
}

export function createAuth(db: Database, env: Env) {
  return betterAuth({
    appName: 'AppsDemo Qualify',
    // Same-origin: the dashboard origin serves /api/auth (Vite proxy in dev, Caddy in prod).
    baseURL: env.APP_BASE_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: [env.APP_BASE_URL],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user,
        session,
        account,
        verification,
        organization: organizationTable,
        member,
        invitation,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh expiry at most once a day
    },
    advanced: {
      cookiePrefix: 'qualify',
      useSecureCookies: env.NODE_ENV === 'production',
    },
    databaseHooks: {
      session: {
        create: {
          // A fresh sign-in opens the user's workspace directly instead of the onboarding picker.
          before: async (newSession) => {
            const [membership] = await db
              .select({ organizationId: member.organizationId })
              .from(member)
              .where(eq(member.userId, newSession.userId))
              .orderBy(member.createdAt)
              .limit(1);
            return {
              data: { ...newSession, activeOrganizationId: membership?.organizationId ?? null },
            };
          },
        },
      },
    },
    plugins: [
      organization({
        creatorRole: 'owner',
        organizationHooks: {
          // Every workspace gets its tenant row (RLS-scoped) and a first audit entry.
          afterCreateOrganization: async ({ organization: org, user: creator }) => {
            await withTenant(db, org.id, async (tx) => {
              await tx.insert(tenants).values({ id: org.id });
              // Every workspace starts with a ready agent from the template picked at
              // onboarding (metadata.template), or the "any business" one.
              const template = findTemplate(templateKeyOf(org.metadata));
              await createPublishedPlaybook(tx, {
                tenantId: org.id,
                name: template.name,
                templateKey: template.key,
                config: template.build(org.name),
                isDefault: true,
              });
              await tx.insert(auditLogs).values({
                tenantId: org.id,
                actorUserId: creator.id,
                action: 'workspace.created',
                target: org.id,
                metadata: { name: org.name, template: template.key },
              });
            });
          },
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type AuthSession = Auth['$Infer']['Session'];
