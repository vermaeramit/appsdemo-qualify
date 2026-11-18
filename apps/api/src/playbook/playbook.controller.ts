import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
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
  type PlaybookVersionList,
  type SimulateResponse,
  simulateRequestSchema,
} from '@qualify/shared';
import { z } from 'zod';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { MessageTemplateService, type TemplateKind } from './message-template.service';
import { PlaybookService } from './playbook.service';
import { SimulatorService } from './simulator.service';

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
    @Inject(SimulatorService) private readonly simulator: SimulatorService,
  ) {}

  /** Test chat: one agent turn on the draft configuration (nothing sent or stored). */
  @Post('simulate')
  @HttpCode(200)
  simulate(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<SimulateResponse> {
    requireManager(workspace);
    return this.simulator.simulate(workspace, parseBody(simulateRequestSchema, body));
  }

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

  /** Version history (FR-4.9). */
  @Get('versions')
  versions(@CurrentWorkspace() workspace: WorkspaceContext): Promise<PlaybookVersionList> {
    return this.playbooks.versions(workspace.tenantId);
  }

  @Get('versions/:id')
  version(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
  ): Promise<PlaybookResponse> {
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new BadRequestException('Invalid version id');
    return this.playbooks.version(workspace.tenantId, parsed.data);
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
