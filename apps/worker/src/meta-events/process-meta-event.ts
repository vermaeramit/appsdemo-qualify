import {
  and,
  auditLogs,
  type Database,
  eq,
  inboundMetaEvents,
  isNull,
  leads,
  messages,
  resolvePlaybookForAttribution,
  resolveTenantByPhoneNumberId,
  sql,
  touchNumberEvent,
  withTenant,
} from '@qualify/db';
import {
  extractLeadgenChanges,
  extractMessageChanges,
  inboundText,
  isAllowedRecipient,
  toE164,
  type WaEcho,
  type WaInboundMessage,
  type WaStatus,
  type WaValue,
} from '@qualify/integrations';
import type { LeadAttribution, RespondJob } from '@qualify/shared';
import { DEV_SWITCH_REASON, quote, type RecordActivity, sendErrorDetail } from '../activity.ts';
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
  /** Activity log (D-091). */
  activity?: RecordActivity;
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
    // Meta reached us for this number: the Logs page uses it to spot a broken webhook.
    await touchNumberEvent(db, tenantId, phoneNumberId).catch((error: unknown) =>
      logger.warn({ eventId, err: error }, 'Could not note the Meta event time'),
    );
    for (const message of change.value.messages ?? []) {
      await handleInboundMessage(deps, tenantId, phoneNumberId, change.value, message);
    }
    for (const status of change.value.statuses ?? []) {
      await handleStatus(deps, tenantId, status);
    }
    for (const echo of change.value.message_echoes ?? []) {
      await handleEcho(deps, tenantId, phoneNumberId, echo);
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
    const routed = attribution ? await resolvePlaybookForAttribution(tx, attribution) : null;
    const [lead] = await tx
      .insert(leads)
      .values({
        tenantId,
        phoneE164: toE164(message.from),
        name: profileName ?? null,
        source: message.referral ? 'ctwa' : 'whatsapp_inbound',
        attribution,
        playbookVersionId: routed?.versionId ?? null,
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
          ...(routed ? { playbookVersionId: routed.versionId } : {}),
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
  if (!stored.isNew) return;
  const text = inboundText(message);
  const base = { tenantId, leadId: stored.leadId } as const;
  await deps.activity?.([
    ...(stored.leadCreated
      ? [
          {
            ...base,
            source: 'lead' as const,
            kind: 'lead.created',
            message: attribution
              ? 'New lead: wrote on WhatsApp from your ad'
              : 'New lead: wrote on WhatsApp',
            detail: {
              ...(profileName ? { 'WhatsApp name': profileName } : {}),
              ...(attribution?.headline ? { Ad: attribution.headline } : {}),
              ...(attribution?.adId ? { 'Ad id': attribution.adId } : {}),
            },
          },
        ]
      : []),
    {
      ...base,
      source: 'whatsapp',
      kind: 'whatsapp.received',
      message: text
        ? `Message from the lead: ${quote(text)}`
        : `Message from the lead (${message.type})`,
      detail: { Type: message.type, 'WhatsApp message id': message.id },
    },
  ]);
  if (NO_REPLY_TYPES.has(message.type)) {
    await deps.activity?.({
      ...base,
      source: 'agent',
      kind: 'agent.skipped',
      message: `AI didn't reply: a "${message.type}" message needs no answer`,
    });
    return;
  }

  if (!isAllowedRecipient(message.from, deps.allowlist, deps.isProduction)) {
    logger.info(
      { tenantId, leadId: stored.leadId },
      'Dev safety switch: sender not in DEV_ALLOWED_NUMBERS, not replying',
    );
    await deps.activity?.({
      ...base,
      source: 'agent',
      kind: 'agent.skipped',
      level: 'warn',
      message: `AI didn't reply: ${DEV_SWITCH_REASON}`,
    });
    return;
  }
  await deps.followUps?.cancel(stored.leadId);
  await deps.enqueueRespond({ tenantId, leadId: stored.leadId });
}

/** Statuses a human reply moves to "Handed off". */
const TAKEOVER_STATUSES = new Set([
  'new',
  'contacting',
  'engaged',
  'unresponsive',
  'undeliverable',
]);

/**
 * Coexistence: someone on the team replied from the WhatsApp Business app. The AI pauses for that
 * lead (the team took over). Echoes to numbers that aren't leads (personal chats) are ignored.
 */
async function handleEcho(
  deps: ProcessorDeps,
  tenantId: string,
  phoneNumberId: string,
  echo: WaEcho,
): Promise<void> {
  let phone: string;
  try {
    phone = toE164(echo.to);
  } catch {
    return;
  }
  const outcome = await withTenant(deps.db, tenantId, async (tx) => {
    const [lead] = await tx
      .select({ id: leads.id, status: leads.status, handoffAt: leads.handoffAt })
      .from(leads)
      .where(eq(leads.phoneE164, phone))
      .limit(1);
    if (!lead) return null;
    const inserted = await tx
      .insert(messages)
      .values({
        tenantId,
        leadId: lead.id,
        phoneNumberId,
        direction: 'outbound',
        sender: 'human_app',
        type: echo.type,
        body: echo.text?.body ?? null,
        payload: echo,
        waMessageId: echo.id,
        status: 'sent',
      })
      .onConflictDoNothing({ target: messages.waMessageId })
      .returning({ id: messages.id });
    if (!inserted.length) return null; // a retried delivery
    const takeOver = TAKEOVER_STATUSES.has(lead.status);
    const now = new Date();
    await tx
      .update(leads)
      .set({
        aiPaused: true,
        lastMessageAt: now,
        ...(takeOver ? { status: 'handoff', handoffAt: lead.handoffAt ?? now } : {}),
      })
      .where(eq(leads.id, lead.id));
    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: null,
      action: 'lead.team_replied_from_app',
      target: lead.id,
      metadata: { waMessageId: echo.id, type: echo.type },
    });
    return { leadId: lead.id, handedOff: takeOver };
  });
  if (!outcome) return;
  await deps.activity?.({
    tenantId,
    leadId: outcome.leadId,
    source: 'whatsapp',
    kind: 'whatsapp.team_reply',
    level: 'warn',
    message: outcome.handedOff
      ? 'Your team replied from the WhatsApp app: the AI is paused and the lead is handed off'
      : 'Your team replied from the WhatsApp app: the AI is paused for this lead',
    detail: echo.text?.body ? { Message: echo.text.body } : {},
  });
  await deps.followUps?.cancel(outcome.leadId);
  if (outcome.handedOff) {
    await deps.emitLeadEvent?.({ tenantId, leadId: outcome.leadId, type: 'lead.handoff' });
  }
  deps.logger.info({ tenantId, leadId: outcome.leadId }, 'Team replied from the app: AI paused');
}

async function handleStatus(
  deps: ProcessorDeps,
  tenantId: string,
  status: WaStatus,
): Promise<void> {
  const result = await withTenant(deps.db, tenantId, async (tx) => {
    const [existing] = await tx
      .select({
        id: messages.id,
        leadId: messages.leadId,
        direction: messages.direction,
        status: messages.status,
        pricing: messages.pricing,
        body: messages.body,
        payload: messages.payload,
        sender: messages.sender,
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
    const moved = moves
      ? {
          leadId: existing.leadId,
          body: existing.body,
          payload: existing.payload,
          sender: existing.sender,
        }
      : null;

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
    if (!undeliverable) return { moved, undeliverableLeadId: null };
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
    if (!marked) return { moved, undeliverableLeadId: null };
    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: null,
      action: 'lead.undeliverable',
      target: marked.id,
      metadata: { errors: status.errors ?? [] },
    });
    return { moved, undeliverableLeadId: marked.id };
  });

  const moved = result?.moved;
  if (moved && status.status !== 'sent') {
    const what = describeOurMessage(moved.body, moved.payload, moved.sender);
    const failed = status.status === 'failed';
    await deps.activity?.({
      tenantId,
      leadId: moved.leadId,
      source: 'whatsapp',
      kind: `whatsapp.${status.status}`,
      level: failed ? 'error' : 'info',
      message: failed
        ? `Not delivered: ${what}`
        : status.status === 'read'
          ? `Read by the lead: ${what}`
          : `Delivered: ${what}`,
      detail: {
        ...(failed ? sendErrorDetail({ errors: status.errors ?? [] }) : {}),
        'WhatsApp message id': status.id,
      },
    });
  }
  const undeliverableLeadId = result?.undeliverableLeadId ?? null;
  if (undeliverableLeadId) {
    await deps.activity?.({
      tenantId,
      leadId: undeliverableLeadId,
      source: 'lead',
      kind: 'lead.undeliverable',
      level: 'warn',
      message:
        "Marked undeliverable: WhatsApp couldn't reach this number, and the lead never wrote to us",
    });
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

/** "the opening “…”", "the AI reply “…”": which of our messages a status is about. */
function describeOurMessage(
  body: string | null,
  payload: Record<string, unknown>,
  sender: string,
): string {
  const kind = typeof payload.kind === 'string' ? payload.kind : null;
  const label =
    kind === 'opening'
      ? 'the opening'
      : kind === 'followup'
        ? 'a follow-up'
        : sender === 'ai'
          ? 'the AI reply'
          : sender === 'human_app'
            ? "your team's message"
            : 'our message';
  const text = quote(body, 80);
  return text ? `${label} ${text}` : label;
}
