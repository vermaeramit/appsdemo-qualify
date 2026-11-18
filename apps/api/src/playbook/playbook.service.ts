import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  auditLogs,
  type DbHandle,
  getDefaultPublishedPlaybook,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import {
  type PlaybookConfig,
  type PlaybookResponse,
  playbookResponseSchema,
} from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { DB } from '../tokens';

/**
 * The workspace's default playbook (agent configuration). Publishing creates a new immutable
 * version; running conversations keep the version they started with.
 */
@Injectable()
export class PlaybookService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  async get(tenantId: string): Promise<PlaybookResponse> {
    const playbook = await withTenant(this.handle.db, tenantId, (tx) =>
      getDefaultPublishedPlaybook(tx),
    );
    if (!playbook) throw new NotFoundException('No playbook yet');
    return playbookResponseSchema.parse(playbook);
  }

  async publish(workspace: WorkspaceContext, config: PlaybookConfig): Promise<PlaybookResponse> {
    const published = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const current = await getDefaultPublishedPlaybook(tx);
      if (!current) return null;
      const next = await publishPlaybookVersion(tx, {
        tenantId: workspace.tenantId,
        playbookId: current.playbookId,
        config,
      });
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: 'playbook.published',
        target: current.playbookId,
        metadata: { versionNo: next.versionNo },
      });
      return next;
    });
    if (!published) throw new NotFoundException('No playbook yet');
    return playbookResponseSchema.parse(published);
  }
}
