import { Body, Controller, HttpCode, Inject, Post, UseGuards } from '@nestjs/common';
import { type CreateLeadResponse, createLeadRequestSchema } from '@qualify/shared';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentWorkspace, type WorkspaceContext } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { LeadIntakeService } from '../leads/lead-intake.service';
import { SkipOriginCheck } from '../security/skip-origin-check.decorator';

/**
 * Inbound lead API (FR-3.1): any source (website, CRM, Postman; Meta lead forms in M4) can
 * create a lead. The agent then sends the opening message on WhatsApp.
 */
@Controller('v1/leads')
@SkipOriginCheck()
@UseGuards(ApiKeyGuard)
export class LeadsV1Controller {
  constructor(@Inject(LeadIntakeService) private readonly intake: LeadIntakeService) {}

  @Post()
  @HttpCode(202)
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<CreateLeadResponse> {
    return this.intake.create(workspace, parseBody(createLeadRequestSchema, body), 'api');
  }
}
