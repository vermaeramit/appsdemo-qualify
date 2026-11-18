import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  type OpeningTemplateStatus,
  playbookConfigSchema,
  type PlaybookResponse,
} from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { MessageTemplateService, type TemplateKind } from './message-template.service';
import { PlaybookService } from './playbook.service';

function parseKind(value: string): TemplateKind {
  if (value === 'opening' || value === 'followup') return value;
  throw new BadRequestException('Unknown template kind');
}

/** Agent configuration in the dashboard (AI agent page). Everyone reads; managers publish. */
@Controller('playbook')
@UseGuards(WorkspaceGuard)
export class PlaybookController {
  constructor(
    @Inject(PlaybookService) private readonly playbooks: PlaybookService,
    @Inject(MessageTemplateService) private readonly templates: MessageTemplateService,
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

  /** Meta review state of the opening or follow-up template. */
  @Get('templates/:kind')
  templateStatus(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('kind') kind: string,
  ): Promise<OpeningTemplateStatus> {
    return this.templates.status(workspace.tenantId, parseKind(kind));
  }

  /** Submits the published text to Meta for review (an outward action). */
  @Post('templates/:kind')
  submitTemplate(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('kind') kind: string,
  ): Promise<OpeningTemplateStatus> {
    requireManager(workspace);
    return this.templates.submit(workspace, parseKind(kind));
  }

  @Post('templates/:kind/activate')
  activateTemplate(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('kind') kind: string,
  ): Promise<OpeningTemplateStatus> {
    requireManager(workspace);
    return this.templates.activate(workspace, parseKind(kind));
  }
}
