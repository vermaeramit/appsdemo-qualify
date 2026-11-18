import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScoring, scoreLead } from '@qualify/core';
import {
  auditLogs,
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  leads,
  publishPlaybookVersion,
  tenants,
  type Transaction,
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
      await this.rescoreLeads(tx, config);
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

  /**
   * Re-applies the (possibly changed) scoring to every lead, so grades stay comparable. Keeps
   * whether a score is final and the summary's usage.
   */
  private async rescoreLeads(tx: Transaction, config: PlaybookConfig): Promise<void> {
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants).limit(1);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: tenant?.timezone ?? 'Asia/Kolkata',
      dateStyle: 'short',
    }).format(new Date());
    const scoring = resolveScoring(config);
    const rows = await tx
      .select({
        id: leads.id,
        fields: leads.fields,
        signals: leads.signals,
        status: leads.status,
        scoreDetails: leads.scoreDetails,
      })
      .from(leads);
    for (const row of rows) {
      const result = scoreLead({
        definitions: config.fields,
        scoring,
        fields: row.fields,
        signals: row.signals,
        status: row.status,
        today,
      });
      await tx
        .update(leads)
        .set({
          score: result.score,
          grade: result.grade,
          scoreDetails: {
            ...result.details,
            final: row.scoreDetails?.final ?? false,
            ...(row.scoreDetails?.summaryUsage
              ? { summaryUsage: row.scoreDetails.summaryUsage }
              : {}),
          },
        })
        .where(eq(leads.id, row.id));
    }
  }
}
