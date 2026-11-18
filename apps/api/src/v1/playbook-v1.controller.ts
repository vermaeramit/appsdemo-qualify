import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';
import { playbookConfigSchema, type PlaybookResponse } from '@qualify/shared';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentWorkspace, type WorkspaceContext } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { PlaybookService } from '../playbook/playbook.service';
import { SkipOriginCheck } from '../security/skip-origin-check.decorator';

/**
 * The workspace's default playbook (agent configuration) over the public API: persona,
 * questions (with options or plain), rules, knowledge base, opening, handoff, closing.
 * PUT publishes a new version; running conversations keep the version they started with.
 */
@Controller('v1/playbook')
@SkipOriginCheck()
@UseGuards(ApiKeyGuard)
export class PlaybookV1Controller {
  constructor(@Inject(PlaybookService) private readonly playbooks: PlaybookService) {}

  @Get()
  get(@CurrentWorkspace() workspace: WorkspaceContext): Promise<PlaybookResponse> {
    return this.playbooks.get(workspace.tenantId);
  }

  @Put()
  publish(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<PlaybookResponse> {
    return this.playbooks.publish(workspace, parseBody(playbookConfigSchema, body));
  }
}
