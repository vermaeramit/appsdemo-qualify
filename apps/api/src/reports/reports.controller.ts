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
import { emailReportInputSchema, updateEmailReportSchema } from '@qualify/shared';
import { z } from 'zod';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { ReportsService } from './reports.service';

const idSchema = z.uuid();
function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid id');
  return parsed.data;
}

/** Scheduled e-mail reports (Integrations page). Owners and managers only. */
@Controller('reports')
@UseGuards(WorkspaceGuard)
export class ReportsController {
  constructor(@Inject(ReportsService) private readonly reports: ReportsService) {}

  @Get()
  list(@CurrentWorkspace() workspace: WorkspaceContext) {
    requireManager(workspace);
    return this.reports.list(workspace);
  }

  @Post()
  create(@CurrentWorkspace() workspace: WorkspaceContext, @Body() body: unknown) {
    requireManager(workspace);
    return this.reports.create(workspace, parseBody(emailReportInputSchema, body));
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    requireManager(workspace);
    return this.reports.update(workspace, parseId(id), parseBody(updateEmailReportSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    await this.reports.remove(workspace, parseId(id));
  }

  @Post(':id/send')
  @HttpCode(202)
  send(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    return this.reports.sendNow(workspace, parseId(id));
  }

  @Get(':id/runs')
  runs(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    return this.reports.runs(workspace, parseId(id));
  }
}
