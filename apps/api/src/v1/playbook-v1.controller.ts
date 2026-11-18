import { Body, Controller, Get, Inject, NotFoundException, Put, UseGuards } from '@nestjs/common';
import {
  auditLogs,
  type DbHandle,
  getDefaultPublishedPlaybook,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import {
  playbookConfigSchema,
  type PlaybookResponse,
  playbookResponseSchema,
} from '@qualify/shared';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentWorkspace, type WorkspaceContext } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { SkipOriginCheck } from '../security/skip-origin-check.decorator';
import { DB } from '../tokens';

/**
 * The workspace's default playbook (agent configuration): persona, questions (with options or
 * plain), rules, knowledge base, opening, handoff, closing. PUT publishes a new version; running
 * conversations keep the version they started with. The visual builder arrives in M5.
 */
@Controller('v1/playbook')
@SkipOriginCheck()
@UseGuards(ApiKeyGuard)
export class PlaybookV1Controller {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  async get(@CurrentWorkspace() workspace: WorkspaceContext): Promise<PlaybookResponse> {
    const playbook = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      getDefaultPublishedPlaybook(tx),
    );
    if (!playbook) throw new NotFoundException('No playbook yet');
    return playbookResponseSchema.parse(playbook);
  }

  @Put()
  async publish(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<PlaybookResponse> {
    const config = parseBody(playbookConfigSchema, body);
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
