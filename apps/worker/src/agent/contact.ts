import { isServiceWindowOpen, renderOpening, resolveOpening } from '@qualify/core';
import {
  and,
  type Database,
  desc,
  eq,
  resolvePlaybookForAttribution,
  leads,
  messages,
  phoneNumbers,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import {
  decryptSecret,
  isAllowedRecipient,
  type MessageHeaderMedia,
  toWaId,
} from '@qualify/integrations';
import type { ContactJob } from '@qualify/shared';
import {
  DEV_SWITCH_REASON,
  quote,
  type RecordActivity,
  sendErrorDetail,
  sendErrorReason,
  type SkipEntry,
  skipEntry,
} from '../activity.ts';
import type { LeadLock } from '../lock.ts';
import { headerMediaFor } from './media.ts';
import { type FollowUpScheduler, startFollowUps } from './follow-up.ts';
import type { Logger } from '../logger.ts';
import {
  type AgentMessagingClient,
  describeSendError,
  type SendResult,
  sendWithOptions,
  sendCaptionedMedia,
} from './send.ts';
import { activateTemplate, checkTemplate, templateNotReadyReason } from './template-activation.ts';

export interface ContactDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  masterKey: Buffer | null;
  createClient: (accessToken: string) => AgentMessagingClient;
  allowlist: readonly string[];
  isProduction: boolean;
  lock: LeadLock;
  /** Starts the follow-up sequence after a delivered opening. */
  followUps?: FollowUpScheduler;
  now?: () => Date;
  /** Activity log (D-091). */
  activity?: RecordActivity;
}

export type ContactOutcome =
  | 'sent_template'
  | 'sent_freeform'
  | 'no_template'
  | 'send_failed'
  | 'skipped_missing'
  | 'skipped_paused'
  | 'skipped_not_allowed'
  | 'skipped_no_playbook'
  | 'skipped_no_number'
  | 'skipped_recent_opening';

/** Openings that weren't attempted, for the activity log. */
const SKIPPED: Partial<Record<ContactOutcome, SkipEntry>> = {
  skipped_paused: { level: 'info', message: 'Opening not sent: the AI is paused for this lead' },
  skipped_no_playbook: {
    level: 'error',
    message: 'Opening not sent: there is no published AI agent',
  },
  skipped_no_number: {
    level: 'error',
    message: 'Opening not sent: no WhatsApp number is connected to this workspace',
  },
  skipped_recent_opening: {
    level: 'info',
    message: 'Opening not sent again: one went out in the last 10 minutes',
  },
};

/** A second form submission within this window does not trigger another opening. */
const OPENING_DEDUPE_MS = 10 * 60 * 1000;

export class ContactBusyError extends Error {
  constructor() {
    super('Lead is being handled by another worker');
    this.name = 'ContactBusyError';
  }
}

/**
 * Sends the opening message to a lead that came from a form or the API (business-initiated).
 * Inside the 24 h window: free-form text with the opening buttons. Outside: the approved
 * template (WhatsApp rule). Without an approved template the attempt is recorded as failed.
 */
export async function processContact(job: ContactJob, deps: ContactDeps): Promise<ContactOutcome> {
  const locked = await deps.lock.withLock(`respond-lock:${job.leadId}`, () => contact(job, deps));
  if (!locked.acquired) throw new ContactBusyError();
  const entry = skipEntry(SKIPPED, locked.result, {
    tenantId: job.tenantId,
    leadId: job.leadId,
    source: 'outreach',
    kind: 'outreach.opening_skipped',
  });
  if (entry) await deps.activity?.(entry);
  return locked.result;
}

async function contact(job: ContactJob, deps: ContactDeps): Promise<ContactOutcome> {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const log = { tenantId: job.tenantId, leadId: job.leadId };

  const context = await withTenant(db, job.tenantId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, job.leadId)).limit(1);
    if (!lead) return null;
    // A new enquiry starts on the current published version of the agent its source routes to
    // (D-086; default agent otherwise), even if an earlier conversation was pinned elsewhere.
    const playbook = await resolvePlaybookForAttribution(tx, lead.attribution);
    const [number] = await tx
      .select({
        phoneNumberId: phoneNumbers.phoneNumberId,
        accessTokenEnc: whatsappAccounts.accessTokenEnc,
        wabaId: whatsappAccounts.wabaId,
      })
      .from(phoneNumbers)
      .innerJoin(whatsappAccounts, eq(phoneNumbers.whatsappAccountId, whatsappAccounts.id))
      .where(eq(phoneNumbers.status, 'active'))
      .limit(1);
    const [lastOpening] = await tx
      .select({ createdAt: messages.createdAt, payload: messages.payload, status: messages.status })
      .from(messages)
      .where(and(eq(messages.leadId, job.leadId), eq(messages.direction, 'outbound')))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    return { lead, playbook, number, lastOpening };
  });

  if (!context) return 'skipped_missing';
  const { lead, playbook, number, lastOpening } = context;
  if (lead.aiPaused) return 'skipped_paused';
  if (!playbook) return 'skipped_no_playbook';
  if (!number) {
    logger.warn(log, 'Workspace has no connected WhatsApp number: cannot contact the lead');
    return 'skipped_no_number';
  }
  // Only a delivered (not failed) opening blocks a quick repeat.
  if (
    lastOpening &&
    (lastOpening.payload as { kind?: string }).kind === 'opening' &&
    lastOpening.status !== 'failed' &&
    now().getTime() - lastOpening.createdAt.getTime() < OPENING_DEDUPE_MS
  ) {
    return 'skipped_recent_opening';
  }
  const allowed = isAllowedRecipient(toWaId(lead.phoneE164), deps.allowlist, deps.isProduction);
  if (allowed && !deps.masterKey) {
    logger.warn(log, 'ENCRYPTION_MASTER_KEY missing: cannot decrypt token');
    await deps.activity?.({
      ...log,
      source: 'outreach',
      kind: 'outreach.opening_failed',
      level: 'error',
      message: "Opening not sent: the server can't read the WhatsApp access token",
    });
    return 'send_failed';
  }

  const opening = resolveOpening(playbook.config);
  const rendered = renderOpening(opening, {
    leadName: lead.name,
    fields: lead.fields,
    businessName: playbook.config.business.name,
  });
  const to = toWaId(lead.phoneE164);
  const windowOpen = isServiceWindowOpen(lead.lastInboundAt, now());
  const client =
    allowed && deps.masterKey
      ? deps.createClient(decryptSecret(number.accessTokenEnc, deps.masterKey))
      : null;

  // An image, video or PDF above the opening (D-084): uploaded to WhatsApp on demand.
  let header: MessageHeaderMedia | null = null;
  if (client && opening.headerMedia && client.uploadMedia) {
    try {
      header = await headerMediaFor(deps, {
        tenantId: job.tenantId,
        client: { uploadMedia: client.uploadMedia.bind(client) },
        phoneNumberId: number.phoneNumberId,
        media: opening.headerMedia,
      });
    } catch (error) {
      logger.warn({ ...log, err: error }, 'Opening media upload failed');
    }
  }

  // Outside the window: the approved template for this text, switched on by itself once Meta
  // approved it (D-096), or the exact reason there is none yet.
  let template = opening.templateName
    ? { name: opening.templateName, language: opening.templateLanguage }
    : null;
  let templateProblem: string | null = null;
  if (client && !windowOpen && !template) {
    const check = await checkTemplate(client, number.wabaId, 'opening', opening);
    if (check.state === 'approved') {
      template = { name: check.name, language: check.language };
      const switched = await activateTemplate(db, {
        tenantId: job.tenantId,
        playbookId: playbook.playbookId,
        kind: 'opening',
        name: check.name,
        language: check.language,
      });
      if (switched) {
        await deps.activity?.({
          ...log,
          source: 'outreach',
          kind: 'outreach.template_activated',
          message: `Meta approved the opening template "${check.name}": it is now used for this agent`,
        });
      }
    } else {
      templateProblem = templateNotReadyReason('opening', check);
    }
  }

  let sent: SendResult;
  let outcome: ContactOutcome;
  if (!client) {
    // Development safety switch: recorded as a failed attempt so the reason shows in the inbox.
    logger.info(log, 'Dev safety switch: lead not in DEV_ALLOWED_NUMBERS, no opening sent');
    sent = {
      waMessageId: null,
      error: {
        message:
          'Not sent: development safety switch. Only numbers in DEV_ALLOWED_NUMBERS receive messages in development.',
      },
      type: windowOpen ? 'text' : 'template',
    };
    outcome = 'skipped_not_allowed';
  } else if (windowOpen) {
    sent =
      header && !opening.buttons.length && client.sendMedia
        ? await sendCaptionedMedia(client.sendMedia.bind(client), {
            phoneNumberId: number.phoneNumberId,
            to,
            media: header,
            caption: rendered.text,
          })
        : await sendWithOptions(client, {
            phoneNumberId: number.phoneNumberId,
            to,
            body: rendered.text,
            options: opening.buttons.length
              ? { kind: 'buttons', buttons: opening.buttons }
              : { kind: 'none' },
            header,
          });
    outcome = sent.waMessageId ? 'sent_freeform' : 'send_failed';
  } else if (template) {
    try {
      const result = await client.sendTemplate({
        phoneNumberId: number.phoneNumberId,
        to,
        templateName: template.name,
        language: template.language,
        bodyParams: rendered.params,
        header: header ?? undefined,
      });
      sent = { waMessageId: result.messageId, error: null, type: 'template' };
      outcome = 'sent_template';
    } catch (error) {
      sent = { waMessageId: null, error: describeSendError(error), type: 'template' };
      outcome = 'send_failed';
    }
  } else {
    sent = {
      waMessageId: null,
      error: {
        message: templateProblem
          ? `${templateProblem.charAt(0).toUpperCase()}${templateProblem.slice(1)}. The lead hasn't written in the last 24 hours, so WhatsApp only allows an approved template.`
          : 'No approved opening template is configured, and the lead has not messaged in the last 24 hours (WhatsApp only allows templates then).',
      },
      type: 'template',
    };
    outcome = 'no_template';
  }

  const stored = await withTenant(db, job.tenantId, async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        tenantId: job.tenantId,
        leadId: job.leadId,
        phoneNumberId: number.phoneNumberId,
        direction: 'outbound',
        sender: 'system',
        type: sent.type,
        body: rendered.text,
        payload: {
          kind: 'opening',
          mode:
            outcome === 'skipped_not_allowed' ? 'blocked' : windowOpen ? 'freeform' : 'template',
          templateName: windowOpen ? null : (template?.name ?? null),
          buttons: opening.buttons,
        },
        waMessageId: sent.waMessageId,
        status: sent.waMessageId ? 'sent' : 'failed',
        error: sent.error,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt });
    await tx
      .update(leads)
      .set({
        ...(sent.waMessageId ? { status: 'contacting' } : {}),
        playbookVersionId: playbook.versionId,
        lastMessageAt: now(),
      })
      .where(eq(leads.id, job.leadId));
    return row!;
  });

  const mode = windowOpen ? 'Free-form message (the lead wrote in the last 24 hours)' : 'Template';
  await deps.activity?.({
    ...log,
    source: 'outreach',
    kind: sent.waMessageId ? 'outreach.opening_sent' : 'outreach.opening_failed',
    level: sent.waMessageId ? 'info' : outcome === 'skipped_not_allowed' ? 'warn' : 'error',
    message: sent.waMessageId
      ? windowOpen
        ? `Opening sent: ${quote(rendered.text)}`
        : `Opening sent with the template "${template?.name ?? ''}"`
      : outcome === 'skipped_not_allowed'
        ? `Opening not sent: ${DEV_SWITCH_REASON}`
        : templateProblem
          ? `Opening not sent: ${templateProblem}`
          : `Opening not sent: ${sendErrorReason(sent.error)}`,
    detail: {
      ...(sent.waMessageId ? {} : sendErrorDetail(sent.error)),
      Mode: mode,
      ...(!windowOpen && template ? { Template: `${template.name} (${template.language})` } : {}),
      ...(header ? { Header: 'Image, video or PDF attached' } : {}),
      Message: rendered.text,
      ...(sent.waMessageId ? { 'WhatsApp message id': sent.waMessageId } : {}),
    },
  });
  if (sent.waMessageId) {
    await startFollowUps(deps.followUps, {
      tenantId: job.tenantId,
      leadId: job.leadId,
      config: playbook.config,
      message: stored,
      activity: deps.activity,
    });
  }
  if (sent.error) logger.warn({ ...log, outcome, error: sent.error }, 'Opening not delivered');
  else logger.info({ ...log, outcome }, 'Opening sent');
  return outcome;
}
