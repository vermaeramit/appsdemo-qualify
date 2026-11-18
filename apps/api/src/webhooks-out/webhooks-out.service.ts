import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  and,
  auditLogs,
  buildWebhookPayload,
  type DbHandle,
  desc,
  eq,
  getDefaultPublishedPlaybook,
  leads,
  sql,
  type Transaction,
  webhookDeliveries,
  webhookEndpoints,
  withTenant,
} from '@qualify/db';
import {
  checkWebhookUrl,
  encryptSecret,
  generateWebhookSecret,
  parseMasterKey,
  WebhookUrlError,
} from '@qualify/integrations';
import {
  type CreateWebhook,
  type LeadEventJob,
  type UpdateWebhook,
  WEBHOOK_DELIVERY_ATTEMPTS,
  WEBHOOK_DELIVERY_BACKOFF_MS,
  type WebhookDeliveryJob,
  type WebhookEndpoint,
  webhookDeliveriesSchema,
  webhookEndpointSchema,
  type WebhookPayload,
  webhookPayloadSchema,
  type WebhookWithSecret,
} from '@qualify/shared';
import type { Queue } from 'bullmq';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { decodeCursor, encodeCursor } from '../common/cursor';
import type { Env } from '../config/env';
import { LEAD_EVENTS_QUEUE_TOKEN, WEBHOOK_DELIVERY_QUEUE_TOKEN } from '../queue/queue.module';
import { DB, ENV } from '../tokens';

const DELIVERIES_PAGE = 25;
type EndpointRow = typeof webhookEndpoints.$inferSelect;

function toEndpoint(row: EndpointRow): WebhookEndpoint {
  return webhookEndpointSchema.parse({
    id: row.id,
    url: row.url,
    description: row.description,
    events: row.events,
    grades: row.grades,
    active: row.active,
    secretHint: row.secretHint,
    createdAt: row.createdAt.toISOString(),
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastFailureAt: row.lastFailureAt?.toISOString() ?? null,
  });
}

/** Webhook endpoints of a workspace, their delivery log, test events and resends (M7). */
@Injectable()
export class WebhooksOutService {
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
    @Inject(LEAD_EVENTS_QUEUE_TOKEN) private readonly leadEvents: Queue<LeadEventJob>,
    @Inject(WEBHOOK_DELIVERY_QUEUE_TOKEN) private readonly deliveries: Queue<WebhookDeliveryJob>,
  ) {
    this.masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
  }

  /** Lead events from the api (intake); the worker fans them out. */
  async emit(event: Omit<LeadEventJob, 'at'>): Promise<void> {
    await this.leadEvents.add(
      'event',
      { ...event, at: new Date().toISOString() },
      {
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  async list(workspace: WorkspaceContext): Promise<WebhookEndpoint[]> {
    const rows = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      tx.select().from(webhookEndpoints).orderBy(webhookEndpoints.createdAt),
    );
    return rows.map(toEndpoint);
  }

  async create(workspace: WorkspaceContext, input: CreateWebhook): Promise<WebhookWithSecret> {
    this.checkUrl(input.url);
    const secret = generateWebhookSecret();
    const row = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [created] = await tx
        .insert(webhookEndpoints)
        .values({
          tenantId: workspace.tenantId,
          url: input.url,
          description: input.description || null,
          events: input.events,
          grades: input.grades,
          secretEnc: encryptSecret(secret, this.key()),
          secretHint: secret.slice(0, 10),
        })
        .returning();
      await this.audit(tx, workspace, 'webhook.created', created!.id, { url: input.url });
      return created!;
    });
    return { endpoint: toEndpoint(row), secret };
  }

  async update(
    workspace: WorkspaceContext,
    id: string,
    input: UpdateWebhook,
  ): Promise<WebhookEndpoint> {
    if (input.url) this.checkUrl(input.url);
    const row = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [updated] = await tx
        .update(webhookEndpoints)
        .set({
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.description !== undefined ? { description: input.description || null } : {}),
          ...(input.events !== undefined ? { events: input.events } : {}),
          ...(input.grades !== undefined ? { grades: input.grades } : {}),
          ...(input.active !== undefined ? { active: input.active } : {}),
        })
        .where(eq(webhookEndpoints.id, id))
        .returning();
      if (!updated) throw new NotFoundException('Webhook not found');
      await this.audit(tx, workspace, 'webhook.updated', id, { ...input });
      return updated;
    });
    return toEndpoint(row);
  }

  async remove(workspace: WorkspaceContext, id: string): Promise<void> {
    await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [deleted] = await tx
        .delete(webhookEndpoints)
        .where(eq(webhookEndpoints.id, id))
        .returning({ id: webhookEndpoints.id, url: webhookEndpoints.url });
      if (!deleted) throw new NotFoundException('Webhook not found');
      await this.audit(tx, workspace, 'webhook.deleted', id, { url: deleted.url });
    });
  }

  async rotateSecret(workspace: WorkspaceContext, id: string): Promise<WebhookWithSecret> {
    const secret = generateWebhookSecret();
    const row = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [updated] = await tx
        .update(webhookEndpoints)
        .set({ secretEnc: encryptSecret(secret, this.key()), secretHint: secret.slice(0, 10) })
        .where(eq(webhookEndpoints.id, id))
        .returning();
      if (!updated) throw new NotFoundException('Webhook not found');
      await this.audit(tx, workspace, 'webhook.secret_rotated', id, {});
      return updated;
    });
    return { endpoint: toEndpoint(row), secret };
  }

  /** Sends a `webhook.test` event with the latest lead (or a sample when there is none). */
  async test(workspace: WorkspaceContext, id: string): Promise<{ deliveryId: string }> {
    const delivery = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [endpoint] = await tx
        .select({ id: webhookEndpoints.id })
        .from(webhookEndpoints)
        .where(eq(webhookEndpoints.id, id))
        .limit(1);
      if (!endpoint) throw new NotFoundException('Webhook not found');
      const [latest] = await tx
        .select({ id: leads.id })
        .from(leads)
        .orderBy(desc(leads.createdAt))
        .limit(1);
      const eventId = randomUUID();
      const payload =
        (latest &&
          (await buildWebhookPayload(tx, {
            tenantId: workspace.tenantId,
            leadId: latest.id,
            type: 'webhook.test',
            eventId,
            at: new Date(),
            appBaseUrl: this.env.APP_BASE_URL,
          }))) ||
        (await this.samplePayload(tx, workspace, eventId));
      const [created] = await tx
        .insert(webhookDeliveries)
        .values({
          tenantId: workspace.tenantId,
          endpointId: id,
          eventId,
          eventType: 'webhook.test',
          leadId: latest?.id ?? null,
          payload,
          nextAttemptAt: new Date(),
        })
        .returning({ id: webhookDeliveries.id });
      return created!;
    });
    await this.enqueue(workspace.tenantId, delivery.id, `test-${delivery.id}`);
    return { deliveryId: delivery.id };
  }

  async deliveryLog(workspace: WorkspaceContext, id: string, cursor: string | undefined) {
    const after = decodeCursor(cursor);
    const rows = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      tx
        .select({
          delivery: webhookDeliveries,
          createdAtText: sql<string>`${webhookDeliveries.createdAt}::text`,
          leadName: leads.name,
          leadPhone: leads.phoneE164,
        })
        .from(webhookDeliveries)
        .leftJoin(leads, eq(leads.id, webhookDeliveries.leadId))
        .where(
          and(
            eq(webhookDeliveries.endpointId, id),
            after
              ? sql`(${webhookDeliveries.createdAt}, ${webhookDeliveries.id}) < (${after.sortKey}::timestamptz, ${after.id}::uuid)`
              : undefined,
          ),
        )
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(DELIVERIES_PAGE + 1),
    );
    const page = rows.slice(0, DELIVERIES_PAGE);
    const last = page.at(-1);
    return webhookDeliveriesSchema.parse({
      deliveries: page.map(({ delivery, leadName, leadPhone }) => ({
        id: delivery.id,
        eventId: delivery.eventId,
        eventType: delivery.eventType,
        leadId: delivery.leadId,
        leadName: leadName ?? leadPhone ?? null,
        status: delivery.status,
        attempts: delivery.attempts,
        responseStatus: delivery.responseStatus,
        responseExcerpt: delivery.responseExcerpt,
        error: delivery.error,
        createdAt: delivery.createdAt.toISOString(),
        deliveredAt: delivery.deliveredAt?.toISOString() ?? null,
        nextAttemptAt: delivery.nextAttemptAt?.toISOString() ?? null,
      })),
      nextCursor:
        rows.length > DELIVERIES_PAGE && last
          ? encodeCursor(last.createdAtText, last.delivery.id)
          : null,
    });
  }

  /** Sends the same payload (same event id) again, with a fresh retry schedule. */
  async resend(workspace: WorkspaceContext, deliveryId: string): Promise<void> {
    await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [updated] = await tx
        .update(webhookDeliveries)
        .set({ status: 'pending', error: null, nextAttemptAt: new Date() })
        .where(eq(webhookDeliveries.id, deliveryId))
        .returning({ id: webhookDeliveries.id });
      if (!updated) throw new NotFoundException('Delivery not found');
      await this.audit(tx, workspace, 'webhook.delivery_resent', deliveryId, {});
    });
    await this.enqueue(workspace.tenantId, deliveryId, `resend-${deliveryId}-${Date.now()}`);
  }

  private async enqueue(tenantId: string, deliveryId: string, jobId: string): Promise<void> {
    await this.deliveries.add(
      'deliver',
      { tenantId, deliveryId },
      {
        jobId,
        attempts: WEBHOOK_DELIVERY_ATTEMPTS,
        backoff: { type: 'exponential', delay: WEBHOOK_DELIVERY_BACKOFF_MS },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  private async samplePayload(
    tx: Transaction,
    workspace: WorkspaceContext,
    eventId: string,
  ): Promise<WebhookPayload> {
    const playbook = await getDefaultPublishedPlaybook(tx);
    const fields = [...(playbook?.config.fields ?? [])].sort((a, b) => a.priority - b.priority);
    const leadId = randomUUID();
    const now = new Date().toISOString();
    return webhookPayloadSchema.parse({
      id: eventId,
      type: 'webhook.test',
      createdAt: now,
      workspace: { id: workspace.tenantId, name: workspace.tenantId },
      lead: {
        id: leadId,
        name: 'Sample Lead',
        phone: '+919800000000',
        source: 'api',
        sourceLabel: 'Website / API',
        status: 'qualified',
        statusLabel: 'Qualified',
        grade: 'warm',
        score: 64,
        scoreReason: 'Sample data for a test event',
        summary: 'This is a test event. Real events carry the lead’s own data.',
        answers: fields.map((field) => ({
          key: field.key,
          label: field.label,
          value: field.options?.[0] ?? 'Sample answer',
        })),
        otherAnswers: {},
        attribution: { channel: 'api', at: now, campaign: 'Test' },
        createdAt: now,
        qualifiedAt: now,
        handoffAt: null,
        conversationUrl: `${this.env.APP_BASE_URL.replace(/\/$/, '')}/conversations?lead=${leadId}`,
      },
    });
  }

  private checkUrl(url: string): void {
    const production = this.env.NODE_ENV === 'production';
    try {
      checkWebhookUrl(url, { allowPrivate: !production, requireHttps: production });
    } catch (error) {
      if (error instanceof WebhookUrlError) throw new BadRequestException(error.message);
      throw error;
    }
  }

  private key(): Buffer {
    if (!this.masterKey) {
      throw new ServiceUnavailableException('ENCRYPTION_MASTER_KEY is not set on the server.');
    }
    return this.masterKey;
  }

  private async audit(
    tx: Transaction,
    workspace: WorkspaceContext,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      tenantId: workspace.tenantId,
      actorUserId: workspace.userId,
      action,
      target,
      metadata,
    });
  }
}
