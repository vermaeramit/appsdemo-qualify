import {
  type Database,
  eq,
  inboundMetaEvents,
  leads,
  messages,
  phoneNumbers,
  resolveTenantByPhoneNumberId,
  sql,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import {
  decryptSecret,
  extractMessageChanges,
  inboundText,
  isAllowedRecipient,
  MetaApiError,
  toE164,
  type WaInboundMessage,
  type WaStatus,
  type WaValue,
  type WhatsAppClient,
} from '@qualify/integrations';
import type { Logger } from '../logger.ts';

export type MessagingClient = Pick<WhatsAppClient, 'sendText' | 'markRead'>;

export interface ProcessorDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Dev safety switch (D-034). */
  allowlist: readonly string[];
  isProduction: boolean;
  /** Null when ENCRYPTION_MASTER_KEY is missing: messages are stored, replies are skipped. */
  masterKey: Buffer | null;
  createClient: (accessToken: string) => MessagingClient;
}

const STATUS_RANK: Record<string, number> = { pending: 0, sent: 1, delivered: 2, read: 3 };

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
  const sentAt = new Date(Number(message.timestamp) * 1000);
  const profileName = value.contacts?.find((contact) => contact.wa_id === message.from)?.profile
    ?.name;
  const text = inboundText(message);

  const stored = await withTenant(db, tenantId, async (tx) => {
    const [lead] = await tx
      .insert(leads)
      .values({
        tenantId,
        phoneE164: toE164(message.from),
        name: profileName ?? null,
        source: message.referral ? 'ctwa' : 'whatsapp_inbound',
        lastMessageAt: sentAt,
      })
      .onConflictDoUpdate({
        target: [leads.tenantId, leads.phoneE164],
        set: { lastMessageAt: sentAt, name: sql`coalesce(${leads.name}, excluded.name)` },
      })
      .returning({ id: leads.id, name: leads.name });

    const inserted = await tx
      .insert(messages)
      .values({
        tenantId,
        leadId: lead!.id,
        phoneNumberId,
        direction: 'inbound',
        sender: 'lead',
        type: message.type,
        body: text,
        payload: message,
        waMessageId: message.id,
        status: 'received',
        createdAt: sentAt,
      })
      .onConflictDoNothing({ target: messages.waMessageId })
      .returning({ id: messages.id });

    return { lead: lead!, isNew: inserted.length > 0 };
  });

  // Meta retries deliveries: a message we already stored must never get a second reply.
  if (!stored.isNew) return;

  if (!isAllowedRecipient(message.from, deps.allowlist, deps.isProduction)) {
    logger.info(
      { tenantId, leadId: stored.lead.id },
      'Dev safety switch: sender not in DEV_ALLOWED_NUMBERS, not replying',
    );
    return;
  }

  // M2 placeholder reply. M3 replaces this with the AI agent (debounced respond job).
  const reply = text
    ? `✅ AppsDemo Qualify (dev) received: “${text.slice(0, 200)}”\nThe AI agent arrives in M3.`
    : `✅ AppsDemo Qualify (dev) received a ${message.type} message. The AI agent arrives in M3.`;
  await sendReply(deps, tenantId, phoneNumberId, stored.lead.id, message, reply);
}

async function sendReply(
  deps: ProcessorDeps,
  tenantId: string,
  phoneNumberId: string,
  leadId: string,
  inbound: WaInboundMessage,
  body: string,
): Promise<void> {
  const { db, logger } = deps;
  if (!deps.masterKey) {
    logger.warn({ tenantId }, 'ENCRYPTION_MASTER_KEY missing: cannot decrypt token, not replying');
    return;
  }

  const [account] = await withTenant(db, tenantId, (tx) =>
    tx
      .select({ accessTokenEnc: whatsappAccounts.accessTokenEnc })
      .from(phoneNumbers)
      .innerJoin(whatsappAccounts, eq(phoneNumbers.whatsappAccountId, whatsappAccounts.id))
      .where(eq(phoneNumbers.phoneNumberId, phoneNumberId))
      .limit(1),
  );
  if (!account) {
    logger.warn({ tenantId, phoneNumberId }, 'No WhatsApp account for phone number, not replying');
    return;
  }

  const client = deps.createClient(decryptSecret(account.accessTokenEnc, deps.masterKey));
  await client.markRead(phoneNumberId, inbound.id).catch((error: unknown) => {
    logger.warn({ err: error }, 'Could not mark message as read');
  });

  let waMessageId: string | null = null;
  let error: Record<string, unknown> | null = null;
  try {
    waMessageId = (await client.sendText({ phoneNumberId, to: inbound.from, body })).messageId;
  } catch (caught) {
    error =
      caught instanceof MetaApiError
        ? { message: caught.message, status: caught.status, code: caught.code ?? null }
        : { message: caught instanceof Error ? caught.message : String(caught) };
    logger.error({ tenantId, leadId, error }, 'Failed to send WhatsApp reply');
  }

  await withTenant(db, tenantId, async (tx) => {
    await tx.insert(messages).values({
      tenantId,
      leadId,
      phoneNumberId,
      direction: 'outbound',
      sender: 'system',
      type: 'text',
      body,
      waMessageId,
      status: waMessageId ? 'sent' : 'failed',
      error,
    });
    await tx.update(leads).set({ lastMessageAt: new Date() }).where(eq(leads.id, leadId));
  });
}

async function handleStatus(db: Database, tenantId: string, status: WaStatus): Promise<void> {
  await withTenant(db, tenantId, async (tx) => {
    const [existing] = await tx
      .select({ id: messages.id, status: messages.status })
      .from(messages)
      .where(eq(messages.waMessageId, status.id))
      .limit(1);
    if (!existing) return;

    const next = status.status;
    const failed = next === 'failed';
    // Statuses can arrive out of order: never move backwards (e.g. read → delivered).
    const moves = failed || (STATUS_RANK[next] ?? -1) > (STATUS_RANK[existing.status] ?? -1);
    if (!moves || !['sent', 'delivered', 'read', 'failed'].includes(next)) return;

    await tx
      .update(messages)
      .set({
        status: next as 'sent' | 'delivered' | 'read' | 'failed',
        statusUpdatedAt: new Date(Number(status.timestamp) * 1000),
        ...(failed ? { error: { errors: status.errors ?? [] } } : {}),
      })
      .where(eq(messages.id, existing.id));
  });
}
