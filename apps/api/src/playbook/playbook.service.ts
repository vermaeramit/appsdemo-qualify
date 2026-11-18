import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  auditLogs,
  type DbHandle,
  getDefaultPublishedPlaybook,
  getPlaybookVersion,
  publishPlaybookVersion,
  sql,
  withTenant,
} from '@qualify/db';
import {
  type PlaybookConfig,
  type PlaybookResponse,
  playbookResponseSchema,
  type PlaybookVersionList,
  playbookVersionListSchema,
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

  /** Published versions of the default playbook with who published them, newest first. */
  async versions(tenantId: string): Promise<PlaybookVersionList> {
    const rows = await withTenant(this.handle.db, tenantId, async (tx) => {
      const current = await getDefaultPublishedPlaybook(tx);
      if (!current) return [];
      return (
        await tx.execute<{
          id: string;
          version_no: number;
          published_at: string | null;
          published_by: string | null;
          questions: number;
        }>(sql`
          select v.id, v.version_no, v.published_at::text as published_at,
                 jsonb_array_length(v.config->'fields')::int as questions,
                 (select u.name from audit_logs a join "user" u on u.id = a.actor_user_id
                  where a.action = 'playbook.published' and a.target = v.playbook_id::text
                    and (a.metadata->>'versionNo')::int = v.version_no
                  order by a.created_at desc limit 1) as published_by
          from playbook_versions v
          where v.playbook_id = ${current.playbookId} and v.status = 'published'
          order by v.version_no desc
          limit 100`)
      ).rows.map((row) => ({ ...row, current: row.id === current.versionId }));
    });
    return playbookVersionListSchema.parse({
      versions: rows.map((row) => ({
        id: row.id,
        versionNo: row.version_no,
        publishedAt: row.published_at ? new Date(row.published_at).toISOString() : null,
        publishedBy: row.published_by,
        questions: row.questions,
        current: row.current,
      })),
    });
  }

  /** One version's configuration (to load it into the editor and publish it again). */
  async version(tenantId: string, versionId: string): Promise<PlaybookResponse> {
    const found = await withTenant(this.handle.db, tenantId, (tx) =>
      getPlaybookVersion(tx, versionId),
    );
    if (!found) throw new NotFoundException('Version not found');
    return playbookResponseSchema.parse(found);
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
