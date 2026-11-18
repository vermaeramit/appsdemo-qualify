import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { auditLogs, type DbHandle, eq, leads, withTenant } from '@qualify/db';
import {
  type CreateLeadResponse,
  createLeadRequestSchema,
  leadOutcomeSchema,
  type StoredLeadOutcome,
} from '@qualify/shared';
import { z } from 'zod';
import { DB } from '../tokens';
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
  constructor(
    @Inject(LeadIntakeService) private readonly intake: LeadIntakeService,
    @Inject(DB) private readonly handle: DbHandle,
  ) {}

  @Post()
  @HttpCode(202)
  create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<CreateLeadResponse> {
    return this.intake.create(workspace, parseBody(createLeadRequestSchema, body), 'api');
  }

  /** Reports what happened after the hand-off (won, lost, …), e.g. from the client's CRM. */
  @Post(':id/outcome')
  @HttpCode(200)
  async outcome(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') idParam: string,
    @Body() body: unknown,
  ): Promise<{ leadId: string; outcome: StoredLeadOutcome }> {
    const id = z.uuid().safeParse(idParam);
    if (!id.success) throw new BadRequestException('Invalid lead id');
    const outcome: StoredLeadOutcome = {
      ...parseBody(leadOutcomeSchema, body),
      at: new Date().toISOString(),
    };
    await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [updated] = await tx
        .update(leads)
        .set({ outcome })
        .where(eq(leads.id, id.data))
        .returning({ id: leads.id });
      if (!updated) throw new NotFoundException('Lead not found');
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: 'lead.outcome_reported',
        target: id.data,
        metadata: outcome,
      });
    });
    return { leadId: id.data, outcome };
  }
}
