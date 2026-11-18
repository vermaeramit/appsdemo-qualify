import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { type CreateLeadResponse, createLeadRequestSchema } from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { LeadIntakeService } from './lead-intake.service';

/** "Add lead" in the dashboard: same intake as the public API (opening message on WhatsApp). */
@Controller('leads')
@UseGuards(WorkspaceGuard)
export class LeadsController {
  constructor(@Inject(LeadIntakeService) private readonly intake: LeadIntakeService) {}

  @Post()
  @HttpCode(202)
  async create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<CreateLeadResponse> {
    requireManager(workspace);
    return this.intake.create(workspace, parseBody(createLeadRequestSchema, body), 'dashboard');
  }
}
