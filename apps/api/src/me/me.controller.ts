import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { eq, member, organization, tenants, withTenant, type DbHandle } from '@qualify/db';
import { type MeResponse, meResponseSchema, type WorkspaceSummary } from '@qualify/shared';
import { SupportService } from '../admin/support.service';
import type { AuthSession } from '../auth/auth';
import { isPlatformAdmin } from '../auth/platform-admin';
import { CurrentSession, SessionGuard } from '../auth/session.guard';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(SupportService) private readonly support: SupportService,
  ) {}

  /** The signed-in user, their workspaces, and the active workspace (read through RLS). */
  @Get()
  async getMe(@CurrentSession() current: AuthSession): Promise<MeResponse> {
    const { db } = this.handle;

    const workspaces = (
      await db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          role: member.role,
        })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(eq(member.userId, current.user.id))
        .orderBy(organization.name)
    ).map((workspace) => ({ ...workspace, role: workspace.role as WorkspaceSummary['role'] }));

    let activeWorkspace: MeResponse['activeWorkspace'] = null;
    const activeId = current.session.activeOrganizationId ?? null;
    const membership = workspaces.find((workspace) => workspace.id === activeId);
    if (membership) {
      activeWorkspace = await this.withSettings(membership, null);
    } else if (activeId) {
      // Not a member: a platform admin's support view (D-092), or one that has just ended.
      const access = await this.support.accessFor(current, activeId);
      const [workspace] = access
        ? await db
            .select({ id: organization.id, name: organization.name, slug: organization.slug })
            .from(organization)
            .where(eq(organization.id, activeId))
            .limit(1)
        : [];
      if (access && workspace) {
        activeWorkspace = await this.withSettings(
          { ...workspace, role: 'admin' },
          {
            id: access.id,
            reason: access.reason,
            startedAt: access.startedAt.toISOString(),
            expiresAt: access.expiresAt.toISOString(),
          },
        );
      } else {
        // Expired or revoked: back to the user's own workspace.
        const back = await this.support.exit(current);
        const own = workspaces.find((workspace) => workspace.id === back);
        if (own) activeWorkspace = await this.withSettings(own, null);
      }
    }

    return meResponseSchema.parse({
      user: {
        id: current.user.id,
        name: current.user.name,
        email: current.user.email,
        isPlatformAdmin: isPlatformAdmin(this.env, current.user.email),
      },
      activeWorkspace,
      workspaces,
    });
  }

  /** Tenant settings live in an RLS-protected table: read them inside the tenant scope. */
  private async withSettings(
    workspace: WorkspaceSummary,
    support: NonNullable<MeResponse['activeWorkspace']>['support'],
  ): Promise<MeResponse['activeWorkspace']> {
    const [tenant] = await withTenant(this.handle.db, workspace.id, (tx) =>
      tx.select().from(tenants).limit(1),
    );
    if (!tenant) return null;
    return {
      ...workspace,
      timezone: tenant.timezone,
      defaultLanguage: tenant.defaultLanguage,
      support,
    };
  }
}
