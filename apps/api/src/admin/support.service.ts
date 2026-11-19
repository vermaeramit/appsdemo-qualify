import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  activeSupportSession,
  type DbHandle,
  endSupportSession,
  eq,
  latestSupportSession,
  listSupportSessions,
  member,
  noteSupportView,
  openSupportSession,
  organization,
  session,
  type SupportSessionRow,
  withTenant,
} from '@qualify/db';
import {
  type OpenSupportAccessInput,
  SUPPORT_ACCESS_MINUTES,
  type SupportSession,
  supportSessionSchema,
} from '@qualify/shared';
import type { AuthSession } from '../auth/auth';
import { isPlatformAdmin } from '../auth/platform-admin';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { recordApiActivity } from '../activity/record';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

const HISTORY_LIMIT = 50;

/** "Asha from platform support": how the workspace sees the admin in its log. */
function supportName(row: Pick<SupportSessionRow, 'adminName'>): string {
  return `${row.adminName.trim() || 'Someone'} from platform support`;
}

/**
 * Support access (D-092): a platform admin views a client's workspace read-only, for
 * SUPPORT_ACCESS_MINUTES, with a reason. The admin's Better Auth session points at the
 * workspace while it lasts; WorkspaceGuard lets that session read and refuses every change.
 */
@Injectable()
export class SupportService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** The open access that lets this browser session view `tenantId`, if any. */
  async accessFor(current: AuthSession, tenantId: string): Promise<SupportSessionRow | null> {
    // Removing the e-mail from PLATFORM_ADMIN_EMAILS ends every access at once.
    if (!isPlatformAdmin(this.env, current.user.email)) return null;
    return activeSupportSession(this.handle.db, tenantId, current.session.id, current.user.id);
  }

  async open(
    current: AuthSession,
    input: OpenSupportAccessInput,
    client: { ipAddress: string | null; userAgent: string | null },
  ): Promise<SupportSessionRow> {
    const { db } = this.handle;
    const [workspace] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, input.workspaceId))
      .limit(1);
    if (!workspace) throw new NotFoundException('Workspace not found');
    const own = await this.ownWorkspaces(current.user.id);
    if (own.includes(workspace.id)) {
      throw new ConflictException('You are a member of this workspace: open it from your list');
    }

    // Opening another workspace ends the access this browser session already has.
    const active = current.session.activeOrganizationId ?? null;
    let returnWorkspaceId = active && own.includes(active) ? active : null;
    if (active && !own.includes(active)) {
      returnWorkspaceId =
        (await latestSupportSession(db, active, current.session.id))?.returnWorkspaceId ?? null;
      await this.close(active, current.session.id);
    }

    const row = await openSupportSession(db, {
      tenantId: workspace.id,
      adminUserId: current.user.id,
      adminName: current.user.name,
      adminEmail: current.user.email,
      authSessionId: current.session.id,
      returnWorkspaceId: returnWorkspaceId ?? own[0] ?? null,
      reason: input.reason,
      minutes: SUPPORT_ACCESS_MINUTES,
      ipAddress: client.ipAddress,
      userAgent: client.userAgent,
    });
    await recordApiActivity(db, {
      tenantId: workspace.id,
      source: 'team',
      kind: 'team.support_opened',
      message: `${supportName(row)} opened this workspace (read-only)`,
      detail: { Reason: row.reason, 'Access ends': row.expiresAt.toISOString() },
    });
    await this.setActiveWorkspace(current.session.id, workspace.id);
    return row;
  }

  /**
   * Leaves the support view: ends the open access, if any, and opens the admin's own workspace
   * again. Also repairs a session left on a workspace it can no longer open (access expired).
   * Returns the workspace now active.
   */
  async exit(current: AuthSession): Promise<string | null> {
    const active = current.session.activeOrganizationId ?? null;
    const own = await this.ownWorkspaces(current.user.id);
    if (!active || own.includes(active)) return active;
    const latest = await latestSupportSession(this.handle.db, active, current.session.id);
    await this.close(active, current.session.id);
    const back =
      latest?.returnWorkspaceId && own.includes(latest.returnWorkspaceId)
        ? latest.returnWorkspaceId
        : (own[0] ?? null);
    await this.setActiveWorkspace(current.session.id, back);
    return back;
  }

  /** Notes a conversation opened in the support view, in the record and the lead's log. */
  async noteConversationView(workspace: WorkspaceContext, leadId: string): Promise<void> {
    if (!workspace.support) return;
    const first = await noteSupportView(
      this.handle.db,
      workspace.tenantId,
      workspace.support.id,
      leadId,
    ).catch(() => false);
    if (!first) return;
    await recordApiActivity(this.handle.db, {
      tenantId: workspace.tenantId,
      leadId,
      source: 'team',
      kind: 'team.support_viewed',
      message: `${supportName(workspace.support)} opened this conversation (read-only)`,
      detail: { Reason: workspace.support.reason },
    });
  }

  /** Every workspace's support accesses, newest first (each read in its own tenant scope). */
  async history(): Promise<SupportSession[]> {
    const { db } = this.handle;
    const workspaces = await db
      .select({ id: organization.id, name: organization.name })
      .from(organization);
    const now = Date.now();
    const items: SupportSession[] = [];
    for (const workspace of workspaces) {
      const rows = await withTenant(db, workspace.id, (tx) =>
        listSupportSessions(tx, HISTORY_LIMIT),
      );
      for (const row of rows) {
        items.push(
          supportSessionSchema.parse({
            id: row.id,
            workspace,
            admin: { name: row.adminName, email: row.adminEmail },
            reason: row.reason,
            startedAt: row.startedAt.toISOString(),
            expiresAt: row.expiresAt.toISOString(),
            endedAt: row.endedAt?.toISOString() ?? null,
            state: row.endedAt ? 'ended' : row.expiresAt.getTime() <= now ? 'expired' : 'active',
            conversationsViewed: row.viewedLeadIds.length,
          }),
        );
      }
    }
    return items.sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, HISTORY_LIMIT);
  }

  private async close(tenantId: string, authSessionId: string): Promise<void> {
    const ended = await endSupportSession(this.handle.db, tenantId, authSessionId);
    if (!ended) return;
    await recordApiActivity(this.handle.db, {
      tenantId,
      source: 'team',
      kind: 'team.support_ended',
      message: `${supportName(ended)} left this workspace`,
      detail: { 'Conversations opened': ended.viewedLeadIds.length },
    });
  }

  /** The admin's own workspaces, oldest membership first. */
  private async ownWorkspaces(userId: string): Promise<string[]> {
    const rows = await this.handle.db
      .select({ id: member.organizationId })
      .from(member)
      .where(eq(member.userId, userId))
      .orderBy(member.createdAt);
    return rows.map((row) => row.id);
  }

  private async setActiveWorkspace(authSessionId: string, workspaceId: string | null) {
    await this.handle.db
      .update(session)
      .set({ activeOrganizationId: workspaceId })
      .where(eq(session.id, authSessionId));
  }
}
