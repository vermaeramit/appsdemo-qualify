import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  type CreateLeadResponse,
  createLeadRequestSchema,
  leadFiltersSchema,
  leadDeletionSchema,
  type LeadDeletionResult,
  type LeadListResponse,
  leadListQuerySchema,
} from '@qualify/shared';
import { auditLogs, type DbHandle, deleteLeadCompletely, withTenant } from '@qualify/db';
import { z } from 'zod';
import { DB } from '../tokens';
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
    @Inject(DB) private readonly handle: DbHandle,
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

  /**
   * Deletes a lead with its conversation, form submissions and webhook deliveries (owners and
   * managers). Messages already on the lead's phone stay there.
   */
  @Delete(':id')
  async remove(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
  ): Promise<LeadDeletionResult> {
    requireManager(workspace);
    const parsed = z.uuid().safeParse(id);
    if (!parsed.success) throw new BadRequestException('Invalid lead id');
    const result = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const deleted = await deleteLeadCompletely(tx, {
        tenantId: workspace.tenantId,
        leadId: parsed.data,
      });
      if (!deleted) return null;
      // The trail keeps who deleted what and when, without the lead's details.
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: 'lead.deleted',
        target: parsed.data,
        metadata: { ...deleted },
      });
      return deleted;
    });
    if (!result) throw new NotFoundException('Lead not found');
    return leadDeletionSchema.parse(result);
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
