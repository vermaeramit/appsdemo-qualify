import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { normaliseFieldValue, resolveScoring, scoreLead } from '@qualify/core';
import {
  auditLogs,
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  leads,
  tenants,
  withTenant,
} from '@qualify/db';
import { toE164 } from '@qualify/integrations';
import {
  type ContactJob,
  type CreateLeadRequest,
  type CreateLeadResponse,
  createLeadResponseSchema,
} from '@qualify/shared';
import type { Queue } from 'bullmq';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { CONTACT_QUEUE_TOKEN } from '../queue/queue.module';
import { DB } from '../tokens';

/**
 * One way in for leads (FR-3.1): the public API, the dashboard's "Add lead" form, and Meta lead
 * forms (M4). Upserts the lead by phone, keeps only answers that fit a playbook question, and
 * queues the opening message on WhatsApp.
 */
@Injectable()
export class LeadIntakeService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(CONTACT_QUEUE_TOKEN) private readonly contactQueue: Queue<ContactJob>,
  ) {}

  async create(
    workspace: WorkspaceContext,
    input: CreateLeadRequest,
    via: 'api' | 'dashboard',
  ): Promise<CreateLeadResponse> {
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
        .select({
          id: leads.id,
          fields: leads.fields,
          name: leads.name,
          status: leads.status,
          signals: leads.signals,
          scoreDetails: leads.scoreDetails,
        })
        .from(leads)
        .where(eq(leads.phoneE164, phone))
        .limit(1);
      const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants).limit(1);

      // A first score from the form answers (the AI adds intent once the lead replies).
      const fields = { ...(existing?.fields ?? {}), ...accepted };
      const scored = playbook
        ? (() => {
            const result = scoreLead({
              definitions,
              scoring: resolveScoring(playbook.config),
              fields,
              signals: existing?.signals ?? null,
              status: existing?.status ?? 'new',
              today: new Intl.DateTimeFormat('en-CA', {
                timeZone: tenant?.timezone ?? 'Asia/Kolkata',
                dateStyle: 'short',
              }).format(new Date()),
            });
            return {
              score: result.score,
              grade: result.grade,
              scoreDetails: {
                ...result.details,
                final: false,
                ...(existing?.scoreDetails?.summaryUsage
                  ? { summaryUsage: existing.scoreDetails.summaryUsage }
                  : {}),
              },
              scoredAt: new Date(),
            };
          })()
        : {};

      let leadId: string;
      if (existing) {
        // A repeat enquiry: one lead, one timeline. New answers overwrite old ones.
        await tx
          .update(leads)
          .set({ name: input.name ?? existing.name, fields, ...scored })
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
            ...scored,
          })
          .returning({ id: leads.id });
        leadId = created!.id;
      }
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: via === 'api' ? 'lead.received_via_api' : 'lead.added_in_dashboard',
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
