import { Body, Controller, Delete, Get, HttpCode, Inject, Put, UseGuards } from '@nestjs/common';
import type { DbHandle } from '@qualify/db';
import { saveAiKeySchema, setAiModelSchema, type WorkspaceAi } from '@qualify/shared';
import { actorName } from '../activity/record';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { DB } from '../tokens';
import { AiService } from './ai.service';

/** The workspace's AI provider and model (Settings → AI, D-094). Everyone reads; managers change. */
@Controller('ai')
@UseGuards(WorkspaceGuard)
export class AiController {
  constructor(
    @Inject(AiService) private readonly ai: AiService,
    @Inject(DB) private readonly handle: DbHandle,
  ) {}

  @Get()
  view(@CurrentWorkspace() workspace: WorkspaceContext): Promise<WorkspaceAi> {
    return this.ai.view(workspace);
  }

  /** Saves the workspace's own OpenAI key (checked with OpenAI first) and the model. */
  @Put('key')
  async saveKey(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<WorkspaceAi> {
    requireManager(workspace);
    const input = parseBody(saveAiKeySchema, body);
    await this.ai.saveKey(workspace, input, await actorName(this.handle.db, workspace.userId));
    return this.ai.view(workspace);
  }

  @Put('model')
  async setModel(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<WorkspaceAi> {
    requireManager(workspace);
    const { model } = parseBody(setAiModelSchema, body);
    await this.ai.setModel(workspace, model, await actorName(this.handle.db, workspace.userId));
    return this.ai.view(workspace);
  }

  @Delete('key')
  @HttpCode(200)
  async removeKey(@CurrentWorkspace() workspace: WorkspaceContext): Promise<WorkspaceAi> {
    requireManager(workspace);
    await this.ai.removeKey(workspace, await actorName(this.handle.db, workspace.userId));
    return this.ai.view(workspace);
  }
}
