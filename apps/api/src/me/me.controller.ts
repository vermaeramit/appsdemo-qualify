import { Controller, Get, Inject, UseGuards } from '@nestjs/common';
import { eq, member, organization, tenants, withTenant, type DbHandle } from '@qualify/db';
import { type MeResponse, meResponseSchema } from '@qualify/shared';
import type { AuthSession } from '../auth/auth';
import { CurrentSession, SessionGuard } from '../auth/session.guard';
import { platformAdmins } from '../admin/admin.controller';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

@Controller('me')
@UseGuards(SessionGuard)
export class MeController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The signed-in user, their workspaces, and the active workspace (read through RLS). */
  @Get()
  async getMe(@CurrentSession() current: AuthSession): Promise<MeResponse> {
    const { db } = this.handle;

    const workspaces = await db
      .select({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        role: member.role,
      })
      .from(member)
      .innerJoin(organization, eq(member.organizationId, organization.id))
      .where(eq(member.userId, current.user.id))
      .orderBy(organization.name);

    const activeId = current.session.activeOrganizationId ?? null;
    const activeMembership = workspaces.find((workspace) => workspace.id === activeId);

    let activeWorkspace: MeResponse['activeWorkspace'] = null;
    if (activeMembership) {
      // Tenant settings live in an RLS-protected table: read them inside the tenant scope.
      const [tenant] = await withTenant(db, activeMembership.id, (tx) =>
        tx.select().from(tenants).limit(1),
      );
      if (tenant) {
        activeWorkspace = {
          ...activeMembership,
          role: activeMembership.role as MeResponse['workspaces'][number]['role'],
          timezone: tenant.timezone,
          defaultLanguage: tenant.defaultLanguage,
        };
      }
    }

    return meResponseSchema.parse({
      user: {
        id: current.user.id,
        name: current.user.name,
        email: current.user.email,
        isPlatformAdmin: platformAdmins(this.env).has(current.user.email.toLowerCase()),
      },
      activeWorkspace,
      workspaces,
    });
  }
}
