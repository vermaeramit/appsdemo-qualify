import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateLeadResponse,
  createLeadRequestSchema,
  leadFiltersSchema,
  type LeadListResponse,
  leadListQuerySchema,
} from '@qualify/shared';
import type { FastifyReply } from 'fastify';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody, parseQuery } from '../common/zod-body';
import { LeadIntakeService } from './lead-intake.service';
import { LeadListService } from './lead-list.service';

@Controller('leads')
@UseGuards(WorkspaceGuard)
export class LeadsController {
  constructor(
    @Inject(LeadIntakeService) private readonly intake: LeadIntakeService,
    @Inject(LeadListService) private readonly leads: LeadListService,
  ) {}

  /** Leads with filters (date, text, status, grade, source), sorted, keyset-paginated. */
  @Get()
  list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: unknown,
  ): Promise<LeadListResponse> {
    const { limit, cursor, ...filters } = parseQuery(leadListQuerySchema, query);
    return this.leads.list(workspace, filters, { limit, cursor });
  }

  /** Excel file of the leads matching the same filters (owners and managers). */
  @Get('export')
  async export(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: unknown,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    requireManager(workspace);
    const { stream, filename } = await this.leads.export(
      workspace,
      parseQuery(leadFiltersSchema, query),
    );
    await reply
      .header('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .header('content-disposition', `attachment; filename="${filename}"`)
      .header('cache-control', 'no-store')
      .send(stream);
  }

  /** "Add lead" in the dashboard: same intake as the public API (opening message on WhatsApp). */
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
