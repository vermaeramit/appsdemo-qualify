import {
  confirmationAsked,
  confirmingIn,
  buildStateNote,
  buildSystemPrompt,
  chooseReplyLanguage,
  chooseReplyOptions,
  isServiceWindowOpen,
  planNextFollowUp,
  prefillMode,
  renderOpening,
  resolveFollowUps,
  toModelHistory,
} from '@qualify/core';
import {
  asc,
  type Database,
  eq,
  getPlaybookVersion,
  resolvePlaybookForAttribution,
  leads,
  messages,
  phoneNumbers,
  tenants,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import { decryptSecret, isAllowedRecipient, type AiResolver, toWaId } from '@qualify/integrations';
import {
  type AgentLanguage,
  agentLanguageSchema,
  agentTurnSchema,
  type FollowUpJob,
  MAX_FOLLOW_UPS,
  type PlaybookConfig,
  type PlaybookFollowUps,
} from '@qualify/shared';
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
import type { Logger } from '../logger.ts';
import { scoreColumns, writeSummary } from './scoring.ts';
import { type AgentMessagingClient, describeSendError, sendWithOptions } from './send.ts';
import { type EmitLeadEvent } from '../webhooks/webhooks.ts';
import { headerMediaFor } from './media.ts';

/** Schedules and cancels a lead's follow-up jobs (BullMQ in production, in memory in tests). */
export interface FollowUpScheduler {
  schedule(job: FollowUpJob, dueAt: Date): Promise<void>;
  cancel(leadId: string): Promise<void>;
}

/** One job id per step, so a running job never blocks scheduling the next one. */
export function followUpJobId(leadId: string, kind: FollowUpJob['kind'], step: number): string {
  return kind === 'unresponsive' ? `followup-${leadId}-done` : `followup-${leadId}-${step}`;
}

export function allFollowUpJobIds(leadId: string): string[] {
  return [
    ...Array.from({ length: MAX_FOLLOW_UPS }, (_, step) => followUpJobId(leadId, 'followup', step)),
    followUpJobId(leadId, 'unresponsive', 0),
  ];
}

/**
 * Starts (or restarts) the follow-up sequence after a message of ours that waits for the lead:
 * the opening, or an AI reply that asked something.
 */
export async function startFollowUps(
  scheduler: FollowUpScheduler | undefined,
  input: {
    tenantId: string;
    leadId: string;
    config: PlaybookConfig;
    message: { id: string; createdAt: Date };
    activity?: RecordActivity | undefined;
  },
): Promise<void> {
  if (!scheduler) return;
  await scheduler.cancel(input.leadId);
  const plan = planNextFollowUp(resolveFollowUps(input.config), 0, input.message.createdAt);
  if (!plan) return;
  await scheduler.schedule(
    {
      tenantId: input.tenantId,
      leadId: input.leadId,
      kind: plan.kind,
      step: plan.step,
      afterMessageId: input.message.id,
    },
    plan.dueAt,
  );
  await input.activity?.(scheduledEntry(input.tenantId, input.leadId, plan));
}

/** "Follow-up 1 scheduled": what happens next if the lead stays quiet. */
function scheduledEntry(
  tenantId: string,
  leadId: string,
  plan: { kind: FollowUpJob['kind']; step: number; dueAt: Date },
) {
  return {
    tenantId,
    leadId,
    source: 'outreach' as const,
    kind: 'outreach.followup_scheduled',
    message:
      plan.kind === 'unresponsive'
        ? "If the lead doesn't answer, they'll be marked as not replying"
        : `Follow-up ${plan.step + 1} scheduled, in case the lead doesn't answer`,
    detail: { Due: plan.dueAt.toISOString() },
  };
}

export interface FollowUpDeps {
  /** Lead events for webhooks (M7). */
  emitLeadEvent?: EmitLeadEvent;
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** The workspace's AI (D-094): without it, follow-ups use the approved template. */
  ai: AiResolver;
  masterKey: Buffer | null;
  createClient: (accessToken: string) => AgentMessagingClient;
  allowlist: readonly string[];
  isProduction: boolean;
  lock: LeadLock;
  scheduler: FollowUpScheduler;
  now?: () => Date;
  /** Activity log (D-091). */
  activity?: RecordActivity;
}

export type FollowUpOutcome =
  | 'sent_freeform'
  | 'sent_template'
  | 'no_template'
  | 'send_failed'
  | 'marked_unresponsive'
  | 'stale'
  | 'skipped_missing'
  | 'skipped_paused'
  | 'skipped_closed'
  | 'skipped_disabled'
  | 'skipped_no_playbook'
  | 'skipped_not_allowed'
  | 'skipped_no_number';

export class FollowUpBusyError extends Error {
  constructor() {
    super('Lead is being handled by another worker');
    this.name = 'FollowUpBusyError';
  }
}

/** Follow-ups that weren't sent, for the activity log (routine cancellations are left out). */
const SKIPPED: Partial<Record<FollowUpOutcome, SkipEntry>> = {
  skipped_disabled: { level: 'info', message: 'Follow-up not sent: follow-ups are turned off' },
  skipped_no_playbook: {
    level: 'error',
    message: 'Follow-up not sent: there is no published AI agent',
  },
  skipped_not_allowed: { level: 'warn', message: `Follow-up not sent: ${DEV_SWITCH_REASON}` },
  skipped_no_number: {
    level: 'error',
    message: "Follow-up not sent: no WhatsApp number is connected, or its access isn't available",
  },
};

/** Leads we are still waiting on. Qualified, handed-off and closed leads get no follow-ups. */
const WAITING_STATUSES = new Set(['contacting', 'engaged']);

export async function processFollowUp(
  job: FollowUpJob,
  deps: FollowUpDeps,
): Promise<FollowUpOutcome> {
  const locked = await deps.lock.withLock(`respond-lock:${job.leadId}`, () => followUp(job, deps));
  if (!locked.acquired) throw new FollowUpBusyError();
  const entry =
    locked.result === 'marked_unresponsive'
      ? {
          tenantId: job.tenantId,
          leadId: job.leadId,
          source: 'lead' as const,
          kind: 'lead.unresponsive',
          message: 'No answer after the follow-ups: marked as not replying',
        }
      : skipEntry(SKIPPED, locked.result, {
          tenantId: job.tenantId,
          leadId: job.leadId,
          source: 'outreach',
          kind: 'outreach.followup_skipped',
        });
  if (entry) await deps.activity?.(entry);
  return locked.result;
}

async function followUp(job: FollowUpJob, deps: FollowUpDeps): Promise<FollowUpOutcome> {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const log = { tenantId: job.tenantId, leadId: job.leadId, kind: job.kind, step: job.step };

  const context = await withTenant(db, job.tenantId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, job.leadId)).limit(1);
    if (!lead) return null;
    const [tenant] = await tx.select().from(tenants).limit(1);
    const playbook = lead.playbookVersionId
      ? await getPlaybookVersion(tx, lead.playbookVersionId)
      : await resolvePlaybookForAttribution(tx, lead.attribution);
    const history = await tx
      .select()
      .from(messages)
      .where(eq(messages.leadId, job.leadId))
      .orderBy(asc(messages.createdAt));
    const [number] = await tx
      .select({
        phoneNumberId: phoneNumbers.phoneNumberId,
        accessTokenEnc: whatsappAccounts.accessTokenEnc,
      })
      .from(phoneNumbers)
      .innerJoin(whatsappAccounts, eq(phoneNumbers.whatsappAccountId, whatsappAccounts.id))
      .where(eq(phoneNumbers.status, 'active'))
      .limit(1);
    return { lead, tenant, playbook, history, number };
  });

  if (!context) return 'skipped_missing';
  const { lead, tenant, playbook, history, number } = context;
  if (lead.aiPaused) return 'skipped_paused';
  if (!WAITING_STATUSES.has(lead.status)) return 'skipped_closed';
  // The lead (or we) wrote since this was scheduled: a newer schedule, or none, applies.
  if (history.at(-1)?.id !== job.afterMessageId) return 'stale';
  if (!playbook) return 'skipped_no_playbook';
  const settings = resolveFollowUps(playbook.config);
  if (!settings.enabled) return 'skipped_disabled';

  if (job.kind === 'unresponsive') {
    // Final score at "No reply" (FR-7.3), plus a summary if the lead ever wrote.
    const scored = scoreColumns({
      config: playbook.config,
      fields: lead.fields,
      signals: lead.signals,
      status: 'unresponsive',
      today: new Intl.DateTimeFormat('en-CA', {
        timeZone: tenant?.timezone ?? settings.timezone,
        dateStyle: 'short',
      }).format(now()),
      final: true,
      now: now(),
      previous: lead.scoreDetails,
    });
    await withTenant(db, job.tenantId, (tx) =>
      tx
        .update(leads)
        .set({ status: 'unresponsive', ...scored })
        .where(eq(leads.id, job.leadId)),
    );
    await writeSummary(deps, {
      tenantId: job.tenantId,
      leadId: job.leadId,
      config: playbook.config,
      history,
      fields: lead.fields,
      scoreDetails: scored.scoreDetails,
    });
    await deps.emitLeadEvent?.({
      tenantId: job.tenantId,
      leadId: job.leadId,
      type: 'lead.unresponsive',
    });
    logger.info(log, 'Lead marked as not replying');
    return 'marked_unresponsive';
  }

  if (!isAllowedRecipient(toWaId(lead.phoneE164), deps.allowlist, deps.isProduction)) {
    return 'skipped_not_allowed';
  }
  if (!number || !deps.masterKey) {
    logger.warn(log, 'No connected number or encryption key: cannot send the follow-up');
    return 'skipped_no_number';
  }
  // Settings changed since scheduling (fewer steps): go straight to the final check.
  if (!settings.steps[job.step]) {
    await scheduleNext(deps, job, settings, settings.steps.length, history.at(-1)!);
    return 'stale';
  }

  const client = deps.createClient(decryptSecret(number.accessTokenEnc, deps.masterKey));
  const to = toWaId(lead.phoneE164);
  const windowOpen = isServiceWindowOpen(lead.lastInboundAt, now());
  const lastOurs = history.at(-1)!;
  const hoursSilent = (now().getTime() - lastOurs.createdAt.getTime()) / 3_600_000;

  let outcome: FollowUpOutcome;
  let stored: { id: string; createdAt: Date };

  // The workspace's AI writes the nudge inside the window; off or over its limit: template.
  const resolution = windowOpen
    ? await deps.ai.forTenant(job.tenantId, { purpose: 'follow_up', leadId: job.leadId })
    : null;
  const ai = resolution?.ok ? resolution.access : null;

  if (windowOpen && ai) {
    // Inside the 24 h window: the AI writes a short, contextual nudge (free for the business).
    const allowedLanguages = (tenant?.allowedLanguages ?? ['hinglish', 'en', 'hi'])
      .map((code) => agentLanguageSchema.safeParse(code))
      .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
    const languages: AgentLanguage[] = allowedLanguages.length
      ? allowedLanguages
      : ['hinglish', 'en', 'hi'];
    const defaultLanguage: AgentLanguage =
      agentLanguageSchema.safeParse(tenant?.defaultLanguage).data ?? 'hinglish';
    const replyLanguage = chooseReplyLanguage({
      latestLeadText: history.filter((m) => m.direction === 'inbound').at(-1)?.body ?? null,
      previous: lead.language,
      allowed: languages,
      fallback: defaultLanguage,
    });
    const { output: turn, usage } = await ai.llm.generateStructured({
      model: ai.model,
      system: buildSystemPrompt(playbook.config, { allowedLanguages: languages, defaultLanguage }),
      messages: toModelHistory(history),
      stateNote: buildStateNote({
        today: new Intl.DateTimeFormat('en-CA', {
          timeZone: tenant?.timezone ?? settings.timezone,
          dateStyle: 'short',
        }).format(now()),
        fields: lead.fields,
        definitions: playbook.config.fields,
        status: lead.status,
        leadName: lead.name,
        replyLanguage,
        followUp: { step: job.step, hoursSilent },
        unconfirmed: lead.unconfirmedFields,
        confirmMode: prefillMode(playbook.config),
        asked: confirmingIn(history.filter((m) => m.direction === 'outbound').at(-1)?.payload),
      }),
      schema: agentTurnSchema,
      reasoningEffort: ai.reasoningEffort,
      cacheKey: `playbook:${playbook.versionId}`,
    });
    // A nudge may repeat the "is this right?" question (D-089).
    const confirming = confirmationAsked(
      playbook.config.fields,
      lead.fields,
      lead.unconfirmedFields,
      prefillMode(playbook.config),
      turn.confirming,
    );
    const options = chooseReplyOptions({
      definitions: playbook.config.fields,
      askingField: turn.askingField,
      confirming,
      confirmMode: prefillMode(playbook.config),
      status: 'engaged',
      language: replyLanguage,
      suggested: turn.quickReplies,
    });
    const sent = await sendWithOptions(client, {
      phoneNumberId: number.phoneNumberId,
      to,
      body: turn.reply,
      options,
    });
    stored = await storeFollowUp(deps, job, number.phoneNumberId, {
      sender: 'ai',
      type: sent.type,
      body: turn.reply,
      payload: {
        kind: 'followup',
        step: job.step,
        mode: 'freeform',
        options,
        askingField: turn.askingField,
        confirming,
        model: usage.model,
        usage,
      },
      waMessageId: sent.waMessageId,
      error: sent.error,
    });
    outcome = sent.waMessageId ? 'sent_freeform' : 'send_failed';
  } else if (settings.template.templateName) {
    // Outside the window WhatsApp only allows an approved template.
    const rendered = renderOpening(settings.template, {
      leadName: lead.name,
      fields: lead.fields,
      businessName: playbook.config.business.name,
    });
    let waMessageId: string | null = null;
    let error: Record<string, unknown> | null = null;
    try {
      const media = settings.template.headerMedia;
      const header =
        media && client.uploadMedia
          ? await headerMediaFor(deps, {
              tenantId: job.tenantId,
              client: { uploadMedia: client.uploadMedia.bind(client) },
              phoneNumberId: number.phoneNumberId,
              media,
            })
          : null;
      waMessageId = (
        await client.sendTemplate({
          phoneNumberId: number.phoneNumberId,
          to,
          templateName: settings.template.templateName,
          language: settings.template.templateLanguage,
          bodyParams: rendered.params,
          header: header ?? undefined,
        })
      ).messageId;
    } catch (sendError) {
      error = describeSendError(sendError);
    }
    stored = await storeFollowUp(deps, job, number.phoneNumberId, {
      sender: 'system',
      type: 'template',
      body: rendered.text,
      payload: {
        kind: 'followup',
        step: job.step,
        mode: 'template',
        templateName: settings.template.templateName,
        buttons: settings.template.buttons,
      },
      waMessageId,
      error,
    });
    outcome = waMessageId ? 'sent_template' : 'send_failed';
  } else {
    // Recorded so the inbox shows why nothing went out; the sequence ends with the final check.
    stored = await storeFollowUp(deps, job, number.phoneNumberId, {
      sender: 'system',
      type: 'template',
      body: renderOpening(settings.template, {
        leadName: lead.name,
        fields: lead.fields,
        businessName: playbook.config.business.name,
      }).text,
      payload: { kind: 'followup', step: job.step, mode: 'template', templateName: null },
      waMessageId: null,
      error: {
        message:
          'Not sent: no approved follow-up template, and the lead has not written in the last 24 hours (WhatsApp only allows templates then).',
      },
    });
    await scheduleNext(deps, job, settings, settings.steps.length, stored);
    logger.warn(log, 'Follow-up skipped: no approved follow-up template');
    return 'no_template';
  }

  if (outcome === 'send_failed') {
    logger.warn(log, 'Follow-up failed to send; the sequence stops here');
    return outcome;
  }
  await scheduleNext(deps, job, settings, job.step + 1, stored);
  logger.info({ ...log, outcome }, 'Follow-up sent');
  return outcome;
}

async function storeFollowUp(
  deps: FollowUpDeps,
  job: FollowUpJob,
  phoneNumberId: string,
  message: {
    sender: 'ai' | 'system';
    type: string;
    body: string;
    payload: Record<string, unknown>;
    waMessageId: string | null;
    error: Record<string, unknown> | null;
  },
): Promise<{ id: string; createdAt: Date }> {
  const now = deps.now ?? (() => new Date());
  const stored = await withTenant(deps.db, job.tenantId, async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        tenantId: job.tenantId,
        leadId: job.leadId,
        phoneNumberId,
        direction: 'outbound',
        sender: message.sender,
        type: message.type,
        body: message.body,
        payload: message.payload,
        waMessageId: message.waMessageId,
        status: message.waMessageId ? 'sent' : 'failed',
        error: message.error,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt });
    await tx.update(leads).set({ lastMessageAt: now() }).where(eq(leads.id, job.leadId));
    return row!;
  });
  const step = job.step + 1;
  const templateName =
    typeof message.payload.templateName === 'string' ? message.payload.templateName : null;
  await deps.activity?.({
    tenantId: job.tenantId,
    leadId: job.leadId,
    source: 'outreach',
    kind: message.waMessageId ? 'outreach.followup_sent' : 'outreach.followup_failed',
    level: message.waMessageId ? 'info' : templateName ? 'error' : 'warn',
    message: message.waMessageId
      ? templateName
        ? `Follow-up ${step} sent with the template "${templateName}"`
        : `Follow-up ${step} sent: ${quote(message.body)}`
      : `Follow-up ${step} not sent: ${sendErrorReason(message.error)}`,
    detail: {
      ...(message.waMessageId ? {} : sendErrorDetail(message.error)),
      Mode: message.payload.mode === 'freeform' ? 'Free-form message' : 'Template',
      Message: message.body,
      ...(message.waMessageId ? { 'WhatsApp message id': message.waMessageId } : {}),
    },
  });
  return stored;
}

/** The follow-up after `sent` ones, or the final "No reply" check, measured from `after`. */
async function scheduleNext(
  deps: FollowUpDeps,
  job: FollowUpJob,
  settings: PlaybookFollowUps,
  sent: number,
  after: { id: string; createdAt: Date },
): Promise<void> {
  const plan = planNextFollowUp(settings, sent, after.createdAt);
  if (!plan) return;
  await deps.scheduler.schedule(
    {
      tenantId: job.tenantId,
      leadId: job.leadId,
      kind: plan.kind,
      step: plan.step,
      afterMessageId: after.id,
    },
    plan.dueAt,
  );
  await deps.activity?.(scheduledEntry(job.tenantId, job.leadId, plan));
}
