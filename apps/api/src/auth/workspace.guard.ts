import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { and, type DbHandle, eq, member } from '@qualify/db';
import type { WorkspaceRole } from '@qualify/shared';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyRequest } from 'fastify';
import { AUTH, DB } from '../tokens';
import type { Auth } from './auth';

export interface WorkspaceContext {
  tenantId: string;
  userId: string;
  role: WorkspaceRole;
}

type RequestWithWorkspace = FastifyRequest & { workspace?: WorkspaceContext };

/**
 * Requires a session AND an active workspace the user is still a member of.
 * Tenant-scoped controllers use @CurrentWorkspace() and pass tenantId to withTenant().
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    @Inject(DB) private readonly handle: DbHandle,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithWorkspace>();
    const session = await this.auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) throw new UnauthorizedException();

    const tenantId = session.session.activeOrganizationId;
    if (!tenantId) throw new ForbiddenException('No active workspace');

    // Defence in depth: the membership could have been removed since the session was created.
    const [membership] = await this.handle.db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, tenantId), eq(member.userId, session.user.id)))
      .limit(1);
    if (!membership) throw new ForbiddenException('Not a member of this workspace');

    request.workspace = {
      tenantId,
      userId: session.user.id,
      role: membership.role as WorkspaceRole,
    };
    return true;
  }
}

export const CurrentWorkspace = createParamDecorator(
  (_data: unknown, context: ExecutionContext): WorkspaceContext => {
    const workspace = context.switchToHttp().getRequest<RequestWithWorkspace>().workspace;
    if (!workspace) throw new UnauthorizedException();
    return workspace;
  },
);
