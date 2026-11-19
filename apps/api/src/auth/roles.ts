import { ForbiddenException } from '@nestjs/common';
import type { WorkspaceContext } from './workspace.guard';

/** Bulk downloads of a client's data stay off in the read-only support view (D-092). */
export function rejectInSupport(workspace: WorkspaceContext, what: string): void {
  if (workspace.support) {
    throw new ForbiddenException(`${what} is off in the read-only support view`);
  }
}

/** Owners and managers (Better Auth `admin`) may change workspace settings; viewers may not. */
export function requireManager(workspace: WorkspaceContext): void {
  if (workspace.role !== 'owner' && workspace.role !== 'admin') {
    throw new ForbiddenException('Only owners and managers can change this');
  }
}
