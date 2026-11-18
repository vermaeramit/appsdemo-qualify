import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { createTemplateRequestSchema, type TemplateList } from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { TemplatesService } from './templates.service';

const NAME = /^[a-z0-9_]{1,512}$/;

/** WhatsApp message templates (Templates page). Everyone reads; managers create and delete. */
@Controller('templates')
@UseGuards(WorkspaceGuard)
export class TemplatesController {
  constructor(@Inject(TemplatesService) private readonly templates: TemplatesService) {}

  @Get()
  list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<TemplateList> {
    return this.templates.list(workspace);
  }

  /** Submits a template to Meta for review (an outward action, by the workspace's manager). */
  @Post()
  create(@CurrentWorkspace() workspace: WorkspaceContext, @Body() body: unknown) {
    requireManager(workspace);
    return this.templates.create(workspace, parseBody(createTemplateRequestSchema, body));
  }

  @Delete(':name')
  @HttpCode(204)
  async remove(@CurrentWorkspace() workspace: WorkspaceContext, @Param('name') name: string) {
    requireManager(workspace);
    if (!NAME.test(name)) throw new BadRequestException('Invalid template name');
    await this.templates.remove(workspace, name);
  }
}
