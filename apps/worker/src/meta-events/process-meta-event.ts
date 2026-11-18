import {
  and,
  auditLogs,
  type Database,
  eq,
  inboundMetaEvents,
  isNull,
  leads,
  messages,
  resolveTenantByPhoneNumberId,
  sql,
  withTenant,
} from '@qualify/db';
import {
  extractLeadgenChanges,
  extractMessageChanges,
  inboundText,
  isAllowedRecipient,
  toE164,
  type WaInboundMessage,
  type WaStatus,
  type WaValue,
} from '@qualify/integrations';
import type { LeadAttribution, RespondJob } from '@qualify/shared';
import type { FollowUpScheduler } from '../agent/follow-up.ts';
import { handleLeadgen, type LeadFormDeps } from './lead-forms.ts';
import type { Logger } from '../logger.ts';
import type { EmitLeadEvent } from '../webhooks/webhooks.ts';

export interface ProcessorDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Dev safety switch (D-034). */
  allowlist: readonly string[];
  isProduction: boolean;
  /** Debounced: several quick messages from a lead produce one AI reply. */
  enqueueRespond: (job: RespondJob) => Promise<void>;
  /** A reply from the lead cancels pending follow-ups. */
  followUps?: FollowUpScheduler;
  /** Meta lead form submissions (Page leadgen webhooks). */
  leadForms?: Omit<LeadFormDeps, 'db' | 'logger' | 'emitLeadEvent'>;
  /** Lead events for webhooks (M7). */
  emitLeadEvent?: EmitLeadEvent;
}

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

/**
 * Meta's "Message undeliverable" (131026): not a WhatsApp number, an outdated app, or terms not
 * accepted. It only marks a lead undeliverable when the lead has never written to us.
 */
const UNDELIVERABLE_CODE = 131026;

const clip = (value: string | undefined, max: number) => (value ? value.slice(0, max) : undefined);

/** The Click-to-WhatsApp ad (or post) behind a lead's message, as attribution. */
export function ctwaAttribution(
  referral: NonNullable<WaInboundMessage['referral']>,
  at: Date,
): LeadAttribution {
  const sourceType = clip(referral.source_type, 32);
  const attribution: LeadAttribution = { channel: 'ctwa', at: at.toISOString() };
  const optional = {
    adId: sourceType === 'ad' ? clip(referral.source_id, 64) : undefined,
    sourceType,
    sourceUrl: clip(referral.source_url, 1000),
    headline: clip(referral.headline, 300),
    body: clip(referral.body, 1000),
    ctwaClid: clip(referral.ctwa_clid, 500),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value) Object.assign(attribution, { [key]: value });
  }
  return attribution;
}

/** Emoji reactions are not messages: never stored as chat turns, never answered. */
const IGNORED_TYPES = new Set(['reaction']);
/** Stored for the record, but they don't warrant an AI reply (e.g. "customer changed number"). */
const NO_REPLY_TYPES = new Set(['system', 'unsupported', 'request_welcome']);

/**
 * Processes one stored Meta webhook delivery. Safe to run more than once for the same event:
 * processed events are skipped and messages are deduplicated on wa_message_id.
 */
export async function processMetaEvent(eventId: string, deps: ProcessorDeps): Promise<void> {
  const { db, logger } = deps;
  const [event] = await db
    .select()
    .from(inboundMetaEvents)
    .where(eq(inboundMetaEvents.id, eventId))
    .limit(1);
  if (!event || event.processedAt) return;

  let changes;
  let leadgen;
  try {
    changes = extractMessageChanges(event.payload);
    leadgen = extractLeadgenChanges(event.payload);
  } catch (error) {
    logger.warn({ eventId, err: error }, 'Unparseable Meta webhook payload');
    await markProcessed(db, eventId, 'invalid payload');
    return;
  }

  for (const change of changes) {
    const phoneNumberId = change.value.metadata.phone_number_id;
    const tenantId = await resolveTenantByPhoneNumberId(db, phoneNumberId);
    if (!tenantId) {
      logger.warn(
        { eventId, phoneNumberId },
        'Webhook for a phone number not connected to any tenant',
      );
      continue;
    }
    for (const message of change.value.messages ?? []) {
      await handleInboundMessage(deps, tenantId, phoneNumberId, change.value, message);
    }
    for (const status of change.value.statuses ?? []) {
      await handleStatus(deps, tenantId, status);
    }
  }

  for (const submission of leadgen) {
    if (!deps.leadForms) {
      logger.warn({ eventId }, 'Lead form webhook received but lead forms are not configured');
      break;
    }
    const outcome = await handleLeadgen(
      { db, logger, ...deps.leadForms, emitLeadEvent: deps.emitLeadEvent },
      submission,
    );
    logger.info({ eventId, leadgenId: submission.leadgen_id, outcome }, 'Lead form run');
  }

  await markProcessed(db, eventId, null);
}

async function markProcessed(db: Database, eventId: string, error: string | null): Promise<void> {
  await db
    .update(inboundMetaEvents)
    .set({ processedAt: new Date(), error })
    .where(eq(inboundMetaEvents.id, eventId));
}

async function handleInboundMessage(
  deps: ProcessorDeps,
  tenantId: string,
  phoneNumberId: string,
  value: WaValue,
  message: WaInboundMessage,
): Promise<void> {
  const { db, logger } = deps;
  if (IGNORED_TYPES.has(message.type)) return;
  const sentAt = new Date(Number(message.timestamp) * 1000);
  const profileName = value.contacts?.find((contact) => contact.wa_id === message.from)?.profile
    ?.name;
  // A tap on a Click-to-WhatsApp ad: remember which ad (last touch).
  const attribution = message.referral ? ctwaAttribution(message.referral, sentAt) : null;

  const stored = await withTenant(db, tenantId, async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        tenantId,
        phoneE164: toE164(message.from),
        name: profileName ?? null,
        source: message.referral ? 'ctwa' : 'whatsapp_inbound',
        attribution,
        lastMessageAt: sentAt,
        lastInboundAt: sentAt,
      })
      .onConflictDoUpdate({
        target: [leads.tenantId, leads.phoneE164],
        set: {
          lastMessageAt: sentAt,
          lastInboundAt: sentAt,
          name: sql`coalesce(${leads.name}, excluded.name)`,
          ...(attribution ? { attribution } : {}),
        },
      })
      .returning({ id: leads.id, created: sql<boolean>`(xmax = 0)` });

    const inserted = await tx
      .insert(messages)
      .values({
        tenantId,
        leadId: lead!.id,
        phoneNumberId,
        direction: 'inbound',
        sender: 'lead',
        type: message.type,
        body: inboundText(message),
        payload: message,
        waMessageId: message.id,
        status: 'received',
        // created_at = our receipt time (DB clock), so in/out messages order consistently.
        // Meta's own timestamp (1 s resolution, Meta's clock) stays in payload and drives
        // last_inbound_at, i.e. the 24 h window.
      })
      .onConflictDoNothing({ target: messages.waMessageId })
      .returning({ id: messages.id });

    return { leadId: lead!.id, isNew: inserted.length > 0, leadCreated: lead!.created };
  });
  if (stored.leadCreated) {
    await deps.emitLeadEvent?.({ tenantId, leadId: stored.leadId, type: 'lead.created' });
  }

  // Meta retries deliveries: a message we already stored must not trigger another reply.
  if (!stored.isNew || NO_REPLY_TYPES.has(message.type)) return;

  if (!isAllowedRecipient(message.from, deps.allowlist, deps.isProduction)) {
    logger.info(
      { tenantId, leadId: stored.leadId },
      'Dev safety switch: sender not in DEV_ALLOWED_NUMBERS, not replying',
    );
    return;
  }
  await deps.followUps?.cancel(stored.leadId);
  await deps.enqueueRespond({ tenantId, leadId: stored.leadId });
}

async function handleStatus(
  deps: ProcessorDeps,
  tenantId: string,
  status: WaStatus,
): Promise<void> {
  const undeliverableLeadId = await withTenant(deps.db, tenantId, async (tx) => {
    const [existing] = await tx
      .select({
        id: messages.id,
        leadId: messages.leadId,
        direction: messages.direction,
        status: messages.status,
        pricing: messages.pricing,
      })
      .from(messages)
      .where(eq(messages.waMessageId, status.id))
      .limit(1);
    if (!existing) return null;

    const next = status.status;
    const failed = next === 'failed';
    // Statuses can arrive out of order: never move backwards (e.g. read → delivered).
    const moves =
      (failed || (STATUS_RANK[next] ?? -1) > (STATUS_RANK[existing.status] ?? -1)) &&
      ['sent', 'delivered', 'read', 'failed'].includes(next);
    // Meta's per-message pricing (billable + category) comes with the first status that has it.
    const pricing =
      status.pricing && !existing.pricing
        ? {
            ...(status.pricing.billable !== undefined ? { billable: status.pricing.billable } : {}),
            ...(status.pricing.category ? { category: status.pricing.category } : {}),
            ...(status.pricing.type ? { type: status.pricing.type } : {}),
          }
        : null;
    if (!moves && !pricing) return null;

    await tx
      .update(messages)
      .set({
        ...(moves
          ? {
              status: next as 'sent' | 'delivered' | 'read' | 'failed',
              statusUpdatedAt: new Date(Number(status.timestamp) * 1000),
              ...(failed ? { error: { errors: status.errors ?? [] } } : {}),
            }
          : {}),
        ...(pricing ? { pricing } : {}),
      })
      .where(eq(messages.id, existing.id));

    // Never reached a lead who never wrote to us: stop trying (a new enquiry tries again).
    const undeliverable =
      failed &&
      existing.direction === 'outbound' &&
      (status.errors ?? []).some((error) => error.code === UNDELIVERABLE_CODE);
    if (!undeliverable) return null;
    const [marked] = await tx
      .update(leads)
      .set({ status: 'undeliverable' })
      .where(
        and(
          eq(leads.id, existing.leadId),
          isNull(leads.lastInboundAt),
          sql`${leads.status} in ('new', 'contacting')`,
        ),
      )
      .returning({ id: leads.id });
    if (!marked) return null;
    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: null,
      action: 'lead.undeliverable',
      target: marked.id,
      metadata: { errors: status.errors ?? [] },
    });
    return marked.id;
  });

  if (undeliverableLeadId) {
    await deps.followUps?.cancel(undeliverableLeadId);
    await deps.emitLeadEvent?.({
      tenantId,
      leadId: undeliverableLeadId,
      type: 'lead.undeliverable',
    });
    deps.logger.info(
      { tenantId, leadId: undeliverableLeadId },
      'Lead is undeliverable on WhatsApp',
    );
  }
}
