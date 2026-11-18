import {
  type Database,
  eq,
  inboundMetaEvents,
  leads,
  messages,
  resolveTenantByPhoneNumberId,
  sql,
  withTenant,
} from '@qualify/db';
import {
  extractMessageChanges,
  inboundText,
  isAllowedRecipient,
  toE164,
  type WaInboundMessage,
  type WaStatus,
  type WaValue,
} from '@qualify/integrations';
import type { RespondJob } from '@qualify/shared';
import type { Logger } from '../logger.ts';

export interface ProcessorDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Dev safety switch (D-034). */
  allowlist: readonly string[];
  isProduction: boolean;
  /** Debounced: several quick messages from a lead produce one AI reply. */
  enqueueRespond: (job: RespondJob) => Promise<void>;
}

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

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
  try {
    changes = extractMessageChanges(event.payload);
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
      await handleStatus(db, tenantId, status);
    }
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

  const stored = await withTenant(db, tenantId, async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        tenantId,
        phoneE164: toE164(message.from),
        name: profileName ?? null,
        source: message.referral ? 'ctwa' : 'whatsapp_inbound',
        lastMessageAt: sentAt,
        lastInboundAt: sentAt,
      })
      .onConflictDoUpdate({
        target: [leads.tenantId, leads.phoneE164],
        set: {
          lastMessageAt: sentAt,
          lastInboundAt: sentAt,
          name: sql`coalesce(${leads.name}, excluded.name)`,
        },
      })
      .returning({ id: leads.id });

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

    return { leadId: lead!.id, isNew: inserted.length > 0 };
  });

  // Meta retries deliveries: a message we already stored must not trigger another reply.
  if (!stored.isNew || NO_REPLY_TYPES.has(message.type)) return;

  if (!isAllowedRecipient(message.from, deps.allowlist, deps.isProduction)) {
    logger.info(
      { tenantId, leadId: stored.leadId },
      'Dev safety switch: sender not in DEV_ALLOWED_NUMBERS, not replying',
    );
    return;
  }
  await deps.enqueueRespond({ tenantId, leadId: stored.leadId });
}

async function handleStatus(db: Database, tenantId: string, status: WaStatus): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: messages.id, status: messages.status, pricing: messages.pricing })
      .from(messages)
      .where(eq(messages.waMessageId, status.id))
      .limit(1);
    if (!existing) return;

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
    if (!moves && !pricing) return;

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
  });
}
