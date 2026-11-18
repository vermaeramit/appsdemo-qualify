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
  type RescoreJob,
} from '@qualify/shared';
import type { Queue } from 'bullmq';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { RESCORE_QUEUE_TOKEN } from '../queue/queue.module';
import { DB } from '../tokens';

/**
 * The workspace's default playbook (agent configuration). Publishing creates a new immutable
 * version; running conversations keep the version they started with.
 */
@Injectable()
export class PlaybookService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(RESCORE_QUEUE_TOKEN) private readonly rescoreQueue: Queue<RescoreJob>,
  ) {}

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
    // Scoring may have changed: the worker rescores every lead in batches.
    await this.rescoreQueue.add(
      'rescore',
      { tenantId: workspace.tenantId },
      {
        delay: 1_000,
        deduplication: {
          id: `rescore:${workspace.tenantId}`,
          ttl: 1_000,
          extend: true,
          replace: true,
          keepLastIfActive: true,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    );
    return playbookResponseSchema.parse(published);
  }
}
