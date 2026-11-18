import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type AgentList,
  type AgentSummary,
  createAgentSchema,
  type RouteOptions,
  updateAgentSchema,
} from '@qualify/shared';
import { z } from 'zod';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { AgentsService } from './agents.service';

function parseId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid agent');
  return parsed.data;
}

/** Agents and their routing rules (AI agent page, D-086). Everyone reads; managers change. */
@Controller('agents')
@UseGuards(WorkspaceGuard)
export class AgentsController {
  constructor(@Inject(AgentsService) private readonly agents: AgentsService) {}

  @Get()
  list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<AgentList> {
    return this.agents.list(workspace.tenantId);
  }

  @Get('route-options')
  routeOptions(@CurrentWorkspace() workspace: WorkspaceContext): Promise<RouteOptions> {
    return this.agents.routeOptions(workspace.tenantId);
  }

  @Post()
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<AgentSummary> {
    requireManager(workspace);
    return this.agents.create(workspace, parseBody(createAgentSchema, body));
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<AgentList> {
    requireManager(workspace);
    return this.agents.update(workspace, parseId(id), parseBody(updateAgentSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    await this.agents.remove(workspace, parseId(id));
  }
}
