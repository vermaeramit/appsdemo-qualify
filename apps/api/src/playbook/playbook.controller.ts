import { Body, Controller, Get, Inject, Post, Put, UseGuards } from '@nestjs/common';
import {
  type OpeningTemplateStatus,
  playbookConfigSchema,
  type PlaybookResponse,
} from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { OpeningTemplateService } from './opening-template.service';
import { PlaybookService } from './playbook.service';

/** Agent configuration in the dashboard (AI agent page). Everyone reads; managers publish. */
@Controller('playbook')
@UseGuards(WorkspaceGuard)
export class PlaybookController {
  constructor(
    @Inject(PlaybookService) private readonly playbooks: PlaybookService,
    @Inject(OpeningTemplateService) private readonly templates: OpeningTemplateService,
  ) {}

  @Get()
  get(@CurrentWorkspace() workspace: WorkspaceContext): Promise<PlaybookResponse> {
    return this.playbooks.get(workspace.tenantId);
  }

  @Put()
  publish(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<PlaybookResponse> {
    requireManager(workspace);
    return this.playbooks.publish(workspace, parseBody(playbookConfigSchema, body));
  }

  @Get('opening-template')
  templateStatus(@CurrentWorkspace() workspace: WorkspaceContext): Promise<OpeningTemplateStatus> {
    return this.templates.status(workspace.tenantId);
  }

  /** Submits the published opening text to Meta for review (an outward action). */
  @Post('opening-template')
  submitTemplate(@CurrentWorkspace() workspace: WorkspaceContext): Promise<OpeningTemplateStatus> {
    requireManager(workspace);
    return this.templates.submit(workspace);
  }

  @Post('opening-template/activate')
  activateTemplate(
    @CurrentWorkspace() workspace: WorkspaceContext,
  ): Promise<OpeningTemplateStatus> {
    requireManager(workspace);
    return this.templates.activate(workspace);
  }
}
