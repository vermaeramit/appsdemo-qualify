import { ForbiddenException } from '@nestjs/common';
import type { WorkspaceContext } from './workspace.guard';

/** Owners and managers (Better Auth `admin`) may change workspace settings; viewers may not. */
export function requireManager(workspace: WorkspaceContext): void {
  if (workspace.role !== 'owner' && workspace.role !== 'admin') {
    throw new ForbiddenException('Only owners and managers can change this');
  }
}
