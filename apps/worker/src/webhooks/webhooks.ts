// Outbound webhooks (M7): a lead event fans out to the workspace's subscribed endpoints, and each
// delivery is POSTed with a signature and retried with backoff until it succeeds or runs out.
import { randomUUID } from 'node:crypto';
import {
  buildWebhookPayload,
  type Database,
  eq,
  webhookDeliveries,
  webhookEndpoints,
  withTenant,
} from '@qualify/db';
import {
  decryptSecret,
  type DeliveryPolicy,
  postWebhook,
  signWebhook,
  WebhookUrlError,
} from '@qualify/integrations';
import type { LeadEventJob, WebhookDeliveryJob, WebhookEventType } from '@qualify/shared';
import type { RecordActivity } from '../activity.ts';
import type { Logger } from '../logger.ts';

/** Producers (respond, follow-ups, intake, webhooks from Meta) report what happened to a lead. */
export type EmitLeadEvent = (event: Omit<LeadEventJob, 'at'>) => Promise<void>;

/** Lead statuses that are events receivers care about. */
export const STATUS_EVENTS: Partial<Record<string, WebhookEventType>> = {
  qualified: 'lead.qualified',
  handoff: 'lead.handoff',
  disqualified: 'lead.disqualified',
  unresponsive: 'lead.unresponsive',
  undeliverable: 'lead.undeliverable',
};

export {
  WEBHOOK_DELIVERY_ATTEMPTS as DELIVERY_ATTEMPTS,
  WEBHOOK_DELIVERY_BACKOFF_MS as DELIVERY_BACKOFF_MS,
} from '@qualify/shared';
import { WEBHOOK_DELIVERY_BACKOFF_MS as DELIVERY_BACKOFF_MS } from '@qualify/shared';

export interface LeadEventDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  appBaseUrl: string;
  enqueueDelivery: (job: WebhookDeliveryJob) => Promise<void>;
}

/** Creates one delivery per subscribed endpoint (grade filter applied) and queues them. */
export async function processLeadEvent(
  job: LeadEventJob,
  deps: LeadEventDeps,
): Promise<'no_endpoints' | 'lead_gone' | number> {
  const created = await withTenant(deps.db, job.tenantId, async (tx) => {
    const endpoints = (
      await tx.select().from(webhookEndpoints).where(eq(webhookEndpoints.active, true))
    ).filter((endpoint) => endpoint.events.includes(job.type));
    if (!endpoints.length) return 'no_endpoints' as const;

    const payload = await buildWebhookPayload(tx, {
      tenantId: job.tenantId,
      leadId: job.leadId,
      type: job.type,
      eventId: randomUUID(),
      at: new Date(job.at),
      appBaseUrl: deps.appBaseUrl,
    });
    if (!payload) return 'lead_gone' as const;

    const grade = payload.lead.grade ?? 'none';
    const targets = endpoints.filter(
      (endpoint) => !endpoint.grades.length || endpoint.grades.includes(grade),
    );
    if (!targets.length) return [];
    return tx
      .insert(webhookDeliveries)
      .values(
        targets.map((endpoint) => ({
          tenantId: job.tenantId,
          endpointId: endpoint.id,
          eventId: payload.id,
          eventType: job.type,
          leadId: job.leadId,
          payload,
          nextAttemptAt: new Date(),
        })),
      )
      .returning({ id: webhookDeliveries.id });
  });
  if (typeof created === 'string') return created;
  for (const delivery of created) {
    await deps.enqueueDelivery({ tenantId: job.tenantId, deliveryId: delivery.id });
  }
  return created.length;
}

export interface DeliveryDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  masterKey: Buffer | null;
  policy: DeliveryPolicy;
  now?: () => Date;
  /** Activity log (D-091). */
  activity?: RecordActivity;
}

/** Thrown to make BullMQ retry a delivery that didn't get a 2xx. */
export class DeliveryRetryError extends Error {}

/**
 * Sends one delivery. `attemptsMade` = failed attempts before this one; on the last attempt a
 * failure is final. Returns the outcome; throws DeliveryRetryError when another try is due.
 */
export async function processWebhookDelivery(
  job: WebhookDeliveryJob,
  attempt: { attemptsMade: number; maxAttempts: number },
  deps: DeliveryDeps,
): Promise<'succeeded' | 'failed' | 'skipped'> {
  const now = deps.now ?? (() => new Date());
  const loaded = await withTenant(deps.db, job.tenantId, async (tx) => {
    const [row] = await tx
      .select({ delivery: webhookDeliveries, endpoint: webhookEndpoints })
      .from(webhookDeliveries)
      .innerJoin(webhookEndpoints, eq(webhookEndpoints.id, webhookDeliveries.endpointId))
      .where(eq(webhookDeliveries.id, job.deliveryId))
      .limit(1);
    return row;
  });
  if (!loaded || loaded.delivery.status === 'succeeded') return 'skipped';
  const { delivery, endpoint } = loaded;
  const final = attempt.attemptsMade + 1 >= attempt.maxAttempts;

  const record = async (outcome: {
    ok: boolean;
    status: number | null;
    excerpt: string | null;
    error: string | null;
    final: boolean;
  }) => {
    const at = now();
    await withTenant(deps.db, job.tenantId, async (tx) => {
      await tx
        .update(webhookDeliveries)
        .set({
          attempts: delivery.attempts + 1,
          responseStatus: outcome.status,
          responseExcerpt: outcome.excerpt,
          error: outcome.error,
          status: outcome.ok ? 'succeeded' : outcome.final ? 'failed' : 'pending',
          deliveredAt: outcome.ok ? at : null,
          nextAttemptAt:
            outcome.ok || outcome.final
              ? null
              : new Date(at.getTime() + DELIVERY_BACKOFF_MS * 2 ** attempt.attemptsMade),
        })
        .where(eq(webhookDeliveries.id, delivery.id));
      await tx
        .update(webhookEndpoints)
        .set(outcome.ok ? { lastSuccessAt: at } : { lastFailureAt: at })
        .where(eq(webhookEndpoints.id, endpoint.id));
    });
    const attemptNo = attempt.attemptsMade + 1;
    await deps.activity?.({
      tenantId: job.tenantId,
      leadId: delivery.leadId,
      source: 'webhook',
      kind: outcome.ok ? 'webhook.delivered' : outcome.final ? 'webhook.failed' : 'webhook.retry',
      level: outcome.ok ? 'info' : outcome.final ? 'error' : 'warn',
      message: outcome.ok
        ? `Webhook "${endpointLabel(endpoint)}" received ${delivery.eventType}`
        : outcome.final
          ? `Webhook "${endpointLabel(endpoint)}" didn't get ${delivery.eventType}: ${outcome.error ?? 'failed'}`
          : `Webhook "${endpointLabel(endpoint)}" didn't get ${delivery.eventType} yet (attempt ${attemptNo} of ${attempt.maxAttempts}), retrying: ${outcome.error ?? 'failed'}`,
      detail: {
        Endpoint: endpoint.url,
        ...(outcome.status !== null ? { 'HTTP status': outcome.status } : {}),
        Attempt: `${attemptNo} of ${attempt.maxAttempts}`,
        ...(outcome.excerpt ? { Response: outcome.excerpt } : {}),
      },
    });
  };

  if (!endpoint.active) {
    await record({
      ok: false,
      status: null,
      excerpt: null,
      error: 'The endpoint is turned off',
      final: true,
    });
    return 'failed';
  }
  if (!deps.masterKey) throw new Error('ENCRYPTION_MASTER_KEY is required to sign webhooks');

  const body = JSON.stringify(delivery.payload);
  const secret = decryptSecret(endpoint.secretEnc, deps.masterKey);
  let result: { status: number; excerpt: string } | null = null;
  let error: string | null = null;
  try {
    result = await postWebhook({
      url: endpoint.url,
      body,
      policy: deps.policy,
      headers: {
        'user-agent': 'AppsDemo-Qualify-Webhooks/1.0',
        'x-qualify-signature': signWebhook(secret, body, Math.floor(now().getTime() / 1000)),
        'x-qualify-event': delivery.eventType,
        'x-qualify-event-id': delivery.eventId,
        'x-qualify-delivery': delivery.id,
      },
    });
  } catch (caught) {
    error =
      caught instanceof WebhookUrlError
        ? caught.message
        : caught instanceof Error
          ? caught.message.slice(0, 300)
          : 'Request failed';
  }

  const ok = result !== null && result.status >= 200 && result.status < 300;
  // A URL we refuse to call won't get better by retrying.
  const giveUp =
    final || (error !== null && /public address|private address|https|password/.test(error));
  await record({
    ok,
    status: result?.status ?? null,
    excerpt: result?.excerpt ?? null,
    error: ok ? null : (error ?? `HTTP ${result?.status ?? 0}`),
    final: giveUp,
  });
  if (ok) return 'succeeded';
  if (giveUp) {
    deps.logger.warn(
      { tenantId: job.tenantId, deliveryId: delivery.id, error, status: result?.status },
      'Webhook delivery failed for good',
    );
    return 'failed';
  }
  throw new DeliveryRetryError(error ?? `HTTP ${result?.status ?? 0}`);
}

/** How an endpoint is named in the activity log: its description, else its host. */
function endpointLabel(endpoint: { description: string | null; url: string }): string {
  if (endpoint.description?.trim()) return endpoint.description.trim().slice(0, 80);
  try {
    return new URL(endpoint.url).host;
  } catch {
    return 'endpoint';
  }
}
