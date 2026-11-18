import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Inject,
  Post,
  UseGuards,
} from '@nestjs/common';
import { normaliseFieldValue } from '@qualify/core';
import {
  auditLogs,
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  leads,
  withTenant,
} from '@qualify/db';
import { toE164 } from '@qualify/integrations';
import {
  type ContactJob,
  type CreateLeadResponse,
  createLeadRequestSchema,
  createLeadResponseSchema,
} from '@qualify/shared';
import type { Queue } from 'bullmq';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CurrentWorkspace, type WorkspaceContext } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { CONTACT_QUEUE_TOKEN } from '../queue/queue.module';
import { SkipOriginCheck } from '../security/skip-origin-check.decorator';
import { DB } from '../tokens';

/**
 * Inbound lead API (FR-3.1): any source (website, CRM, Postman; Meta lead forms in M4) can
 * create a lead. The agent then sends the opening message on WhatsApp.
 */
@Controller('v1/leads')
@SkipOriginCheck()
@UseGuards(ApiKeyGuard)
export class LeadsV1Controller {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(CONTACT_QUEUE_TOKEN) private readonly contactQueue: Queue<ContactJob>,
  ) {}

  @Post()
  @HttpCode(202)
  async create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<CreateLeadResponse> {
    const input = parseBody(createLeadRequestSchema, body);
    let phone: string;
    try {
      phone = toE164(input.phone);
    } catch {
      throw new BadRequestException({
        message: 'Invalid request body',
        issues: [
          { path: 'phone', message: 'Use a full number with country code, e.g. +919812345678' },
        ],
      });
    }

    const result = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      // Keep only answers that match a playbook question and fit its type.
      const playbook = await getDefaultPublishedPlaybook(tx);
      const definitions = playbook?.config.fields ?? [];
      const accepted: Record<string, string> = {};
      const ignoredFields: string[] = [];
      for (const [key, value] of Object.entries(input.fields ?? {})) {
        const field = definitions.find((definition) => definition.key === key);
        const normalised = field ? normaliseFieldValue(field, value) : null;
        if (normalised === null) ignoredFields.push(key);
        else accepted[key] = normalised;
      }

      const [existing] = await tx
        .select({ id: leads.id, fields: leads.fields, name: leads.name })
        .from(leads)
        .where(eq(leads.phoneE164, phone))
        .limit(1);

      let leadId: string;
      if (existing) {
        // A repeat enquiry: one lead, one timeline. New answers overwrite old ones.
        await tx
          .update(leads)
          .set({ name: input.name ?? existing.name, fields: { ...existing.fields, ...accepted } })
          .where(eq(leads.id, existing.id));
        leadId = existing.id;
      } else {
        const [created] = await tx
          .insert(leads)
          .values({
            tenantId: workspace.tenantId,
            phoneE164: phone,
            name: input.name ?? null,
            source: input.source,
            fields: accepted,
          })
          .returning({ id: leads.id });
        leadId = created!.id;
      }
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: 'lead.received_via_api',
        target: leadId,
        metadata: { source: input.source, campaign: input.campaign ?? null, ignoredFields },
      });
      return { leadId, isNewLead: !existing, ignoredFields };
    });

    await this.contactQueue.add(
      'contact',
      { tenantId: workspace.tenantId, leadId: result.leadId },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 3_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );

    return createLeadResponseSchema.parse({ ...result, status: 'queued' });
  }
}
