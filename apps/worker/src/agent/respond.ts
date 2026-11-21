import {
  applyAgentTurn,
  confirmingIn,
  prefillMode,
  buildStateNote,
  chooseReplyLanguage,
  buildSystemPrompt,
  isServiceWindowOpen,
  toModelHistory,
} from '@qualify/core';
import {
  asc,
  type Database,
  desc,
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
import {
  aiDeniedMessage,
  type AiResolver,
  decryptSecret,
  isAllowedRecipient,
  type LlmUsage,
  toWaId,
} from '@qualify/integrations';
import {
  type AgentLanguage,
  agentLanguageSchema,
  type AgentTurn,
  agentTurnSchema,
  type LeadAttribution,
  type RespondJob,
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
import { type FollowUpScheduler, startFollowUps } from './follow-up.ts';
import { FINAL_STATUSES, scoreColumns, writeSummary } from './scoring.ts';
import { type AgentMessagingClient, sendWithOptions } from './send.ts';
import type { Logger } from '../logger.ts';
import { type EmitLeadEvent, STATUS_EVENTS } from '../webhooks/webhooks.ts';

export type { AgentMessagingClient } from './send.ts';

export interface RespondDeps {
  /** Lead events for webhooks (M7). */
  emitLeadEvent?: EmitLeadEvent;
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** The workspace's AI (its own key, AppsDemo's, or off; D-094). */
  ai: AiResolver;
  masterKey: Buffer | null;
  createClient: (accessToken: string) => AgentMessagingClient;
  allowlist: readonly string[];
  isProduction: boolean;
  lock: LeadLock;
  /** Schedules another respond run (used when the lead wrote again while we were thinking). */
  enqueueRespond: (job: RespondJob, delayMs: number) => Promise<void>;
  /** Follow-ups after a reply that waits for the lead; cancelled once the lead is done. */
  followUps?: FollowUpScheduler;
  now?: () => Date;
  timeZone?: string;
  /** Activity log (D-091). */
  activity?: RecordActivity;
}

/** Thrown when another worker is answering this lead; BullMQ retries the job shortly. */
export class LeadBusyError extends Error {
  constructor() {
    super('Lead is being answered by another worker');
    this.name = 'LeadBusyError';
  }
}

export type RespondOutcome =
  | 'replied'
  | 'send_failed'
  | 'skipped_paused'
  | 'skipped_closed'
  | 'skipped_nothing_new'
  | 'skipped_window_closed'
  | 'skipped_not_allowed'
  | 'skipped_no_ai'
  | 'skipped_no_playbook'
  | 'superseded';

const SILENT_STATUSES = new Set<string>(['disqualified', 'handoff']);

/** Why the AI stayed silent, for the activity log (routine outcomes are left out). */
const SKIPPED: Partial<Record<RespondOutcome, SkipEntry>> = {
  skipped_paused: { level: 'info', message: "AI didn't reply: the AI is paused for this lead" },
  skipped_closed: {
    level: 'info',
    message: "AI didn't reply: the lead is handed off or not a fit, so the AI stays quiet",
  },
  skipped_window_closed: {
    level: 'warn',
    message:
      "AI didn't reply: the lead's last message is more than 24 hours old (WhatsApp allows only templates then)",
  },
  skipped_not_allowed: { level: 'warn', message: `AI didn't reply: ${DEV_SWITCH_REASON}` },
  skipped_no_playbook: {
    level: 'error',
    message: "AI didn't reply: there is no published AI agent for this lead",
  },
};

const STATUS_TEXT: Record<string, string> = {
  qualified: 'Qualified',
  handoff: 'Handed off to the team',
  disqualified: 'Not a fit',
};

const AD_CONTEXT_MS = 72 * 3_600_000;

/** The Click-to-WhatsApp ad the lead tapped, while that enquiry is fresh. */
function freshAd(attribution: LeadAttribution | null, at: Date) {
  if (attribution?.channel !== 'ctwa') return undefined;
  if (at.getTime() - Date.parse(attribution.at) > AD_CONTEXT_MS) return undefined;
  if (!attribution.headline && !attribution.body) return undefined;
  return { headline: attribution.headline, body: attribution.body };
}

function localDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(now); // YYYY-MM-DD
}

/**
 * One debounced "answer this lead" run. Safe to run repeatedly: it only replies when the lead's
 * latest message is newer than our latest reply, and never in parallel for the same lead.
 */
export async function processRespond(job: RespondJob, deps: RespondDeps): Promise<RespondOutcome> {
  const locked = await deps.lock.withLock(`respond-lock:${job.leadId}`, () => respond(job, deps));
  if (!locked.acquired) throw new LeadBusyError();
  const entry = skipEntry(SKIPPED, locked.result, {
    tenantId: job.tenantId,
    leadId: job.leadId,
    source: 'agent',
    kind: 'agent.skipped',
  });
  if (entry) await deps.activity?.(entry);
  return locked.result;
}

async function respond(job: RespondJob, deps: RespondDeps): Promise<RespondOutcome> {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const log = { tenantId: job.tenantId, leadId: job.leadId };

  // 1. Load everything we need in one tenant-scoped transaction.
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
    return { lead, tenant, playbook, history };
  });
  if (!context) return 'skipped_nothing_new';
  const { lead, tenant, playbook, history } = context;

  // 2. Guards.
  if (lead.aiPaused) return 'skipped_paused';
  if (SILENT_STATUSES.has(lead.status)) return 'skipped_closed';
  if (!playbook) {
    logger.warn(log, 'No published playbook for tenant: the agent cannot reply');
    return 'skipped_no_playbook';
  }
  if (!isAllowedRecipient(toWaId(lead.phoneE164), deps.allowlist, deps.isProduction)) {
    return 'skipped_not_allowed';
  }
  const latestInbound = history.filter((m) => m.direction === 'inbound').at(-1);
  const latestOutbound = history.filter((m) => m.direction === 'outbound').at(-1);
  if (!latestInbound || (latestOutbound && latestOutbound.createdAt >= latestInbound.createdAt)) {
    return 'skipped_nothing_new';
  }
  if (!isServiceWindowOpen(lead.lastInboundAt ?? latestInbound.createdAt, now())) {
    logger.info(log, '24 h window closed: free-form reply not allowed (templates come in M4)');
    return 'skipped_window_closed';
  }

  // 3. The workspace's AI: its own key or AppsDemo's, the model, the monthly limit (D-094).
  const resolution = await deps.ai.forTenant(job.tenantId, {
    purpose: 'reply',
    leadId: job.leadId,
  });
  if (!resolution.ok) {
    await deps.activity?.({
      ...log,
      source: 'agent',
      kind: 'agent.skipped',
      level: resolution.reason === 'limit' ? 'warn' : 'error',
      message: `AI didn't reply: ${aiDeniedMessage(resolution)}`,
      detail:
        resolution.reason === 'limit'
          ? {
              'Spent this month': `$${(resolution.spentUsd ?? 0).toFixed(2)}`,
              'Monthly limit': `$${resolution.limitUsd ?? 0}`,
            }
          : {},
    });
    return 'skipped_no_ai';
  }
  const ai = resolution.access;

  // 4. WhatsApp client for this tenant's number (+ "typing…" while we think).
  const client = await createTenantClient(deps, job.tenantId, latestInbound.phoneNumberId);
  if (!client) {
    await deps.activity?.({
      tenantId: job.tenantId,
      leadId: job.leadId,
      source: 'agent',
      kind: 'agent.skipped',
      level: 'error',
      message:
        "AI didn't reply: the WhatsApp number's access isn't available (reconnect the number)",
    });
    return 'send_failed';
  }
  if (latestInbound.waMessageId) {
    await client
      .markRead(latestInbound.phoneNumberId, latestInbound.waMessageId, { typing: true })
      .catch((error: unknown) => logger.warn({ ...log, err: error }, 'Typing indicator failed'));
  }

  // 5. Ask the model for the next turn.
  const allowedLanguages = (tenant?.allowedLanguages ?? ['hinglish', 'en', 'hi'])
    .map((code) => agentLanguageSchema.safeParse(code))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  const defaultLanguage: AgentLanguage =
    agentLanguageSchema.safeParse(tenant?.defaultLanguage).data ?? 'hinglish';
  const definitions = playbook.config.fields;
  const confirmMode = prefillMode(playbook.config);
  // Answers our last message asked the lead to confirm: only these can be confirmed now.
  const asked = confirmingIn(latestOutbound?.payload);
  const replyLanguage = chooseReplyLanguage({
    latestLeadText: latestInbound.body,
    previous: lead.language,
    allowed: allowedLanguages.length ? allowedLanguages : ['hinglish', 'en', 'hi'],
    fallback: defaultLanguage,
  });

  let turn: AgentTurn;
  let usage: LlmUsage;
  try {
    ({ output: turn, usage } = await ai.llm.generateStructured({
      model: ai.model,
      system: buildSystemPrompt(playbook.config, {
        allowedLanguages: allowedLanguages.length ? allowedLanguages : ['hinglish', 'en', 'hi'],
        defaultLanguage,
      }),
      messages: toModelHistory(history),
      stateNote: buildStateNote({
        today: localDate(now(), deps.timeZone ?? tenant?.timezone ?? 'Asia/Kolkata'),
        fields: lead.fields,
        definitions,
        status: lead.status,
        leadName: lead.name,
        replyLanguage,
        ad: freshAd(lead.attribution, now()),
        unconfirmed: lead.unconfirmedFields,
        confirmMode,
        asked,
      }),
      schema: agentTurnSchema,
      reasoningEffort: ai.reasoningEffort,
      cacheKey: `playbook:${playbook.versionId}`,
    }));
  } catch (error) {
    logger.error({ ...log, err: error }, 'AI turn failed');
    throw error; // BullMQ retries
  }

  // 6. The lead may have written again while the model was thinking: answer the newest state.
  const [newest] = await withTenant(db, job.tenantId, (tx) =>
    tx
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.leadId, job.leadId))
      .orderBy(desc(messages.createdAt))
      .limit(1),
  );
  if (newest && newest.id !== history.at(-1)?.id) {
    await deps.enqueueRespond(job, 1_000);
    return 'superseded';
  }

  // 7. Apply the turn (same pure logic the eval harness uses).
  const applied = applyAgentTurn(
    definitions,
    { ...lead, unconfirmed: lead.unconfirmedFields, asked },
    turn,
    replyLanguage,
    confirmMode,
  );
  const { reply, options, status } = applied;
  const updates: Partial<typeof leads.$inferInsert> = {};
  if (applied.becameQualified) updates.qualifiedAt = now();
  if (applied.handedOff) updates.handoffAt = now();
  // Live score after every turn; final (with a summary) when the conversation just ended.
  const finished =
    FINAL_STATUSES.has(status) && (status !== lead.status || applied.becameQualified);
  const scored = scoreColumns({
    config: playbook.config,
    fields: applied.fields,
    signals: applied.signals,
    status,
    today: localDate(now(), deps.timeZone ?? tenant?.timezone ?? 'Asia/Kolkata'),
    final: FINAL_STATUSES.has(status),
    now: now(),
    previous: lead.scoreDetails,
  });

  // 8. Send.
  const sent = await sendWithOptions(client, {
    phoneNumberId: latestInbound.phoneNumberId,
    to: toWaId(lead.phoneE164),
    body: reply,
    options,
  });
  const waMessageId = sent.waMessageId;
  if (sent.error) logger.error({ ...log, error: sent.error }, 'Failed to send AI reply');

  // 9. Persist the reply and the lead's new state.
  const stored = await withTenant(db, job.tenantId, async (tx) => {
    const [row] = await tx
      .insert(messages)
      .values({
        tenantId: job.tenantId,
        leadId: job.leadId,
        phoneNumberId: latestInbound.phoneNumberId,
        direction: 'outbound',
        sender: 'ai',
        type: sent.type,
        body: reply,
        payload: {
          options,
          askingField: turn.askingField,
          model: usage.model,
          usage,
          extracted: turn.extracted,
          confirming: applied.confirming,
          confirmed: applied.confirmed,
          rejected: applied.rejected,
          handoff: turn.handoff,
          disqualified: turn.disqualified,
        },
        waMessageId,
        status: waMessageId ? 'sent' : 'failed',
        error: sent.error,
      })
      .returning({ id: messages.id, createdAt: messages.createdAt });
    await tx
      .update(leads)
      .set({
        ...updates,
        ...scored,
        fields: applied.fields,
        unconfirmedFields: applied.unconfirmed,
        language: applied.language ?? lead.language,
        signals: applied.signals,
        status,
        aiPaused: applied.aiPaused,
        playbookVersionId: playbook.versionId,
        lastMessageAt: now(),
      })
      .where(eq(leads.id, job.leadId));
    return row!;
  });

  if (finished) {
    await writeSummary(deps, {
      tenantId: job.tenantId,
      leadId: job.leadId,
      config: playbook.config,
      history: [...history, { direction: 'outbound', sender: 'ai', type: 'text', body: reply }],
      fields: applied.fields,
      scoreDetails: scored.scoreDetails,
    });
  }

  const event = STATUS_EVENTS[status];
  if (event && (status !== lead.status || applied.becameQualified)) {
    await deps.emitLeadEvent?.({ tenantId: job.tenantId, leadId: job.leadId, type: event });
  }

  const cost = await ai.costOf(usage);
  const learnt = applied.changed.map((key) => `${key}=${applied.fields[key] ?? ''}`);
  await deps.activity?.([
    {
      ...log,
      source: 'agent',
      kind: waMessageId ? 'agent.replied' : 'agent.send_failed',
      level: waMessageId ? 'info' : 'error',
      message: waMessageId
        ? `AI replied: ${quote(reply)}`
        : `AI reply not sent: ${sendErrorReason(sent.error)}`,
      detail: {
        ...(waMessageId ? {} : sendErrorDetail(sent.error)),
        ...(waMessageId ? {} : { Reply: reply }),
        Model: usage.model,
        Tokens: `${usage.inputTokens} in (${usage.cachedInputTokens} cached) · ${usage.outputTokens} out`,
        'AI time': `${(usage.latencyMs / 1000).toFixed(1)} s`,
        ...(cost !== null ? { 'AI cost': `${cost.toFixed(4)}` } : {}),
        ...(learnt.length ? { Learnt: learnt.join('; ') } : {}),
        ...(applied.rejected.length
          ? {
              'Not accepted': applied.rejected
                .map((item) => `${item.key}=${item.value} (${item.reason})`)
                .join('; '),
            }
          : {}),
        ...(applied.confirmed.length ? { Confirmed: applied.confirmed.join(', ') } : {}),
        ...(applied.confirming.length ? { 'Asked to confirm': applied.confirming.join(', ') } : {}),
        ...(turn.askingField ? { Asking: turn.askingField } : {}),
        ...(status !== lead.status ? { Status: `${lead.status} → ${status}` } : {}),
        Score: `${scored.score} (${scored.grade})`,
        ...(turn.handoff.requested && turn.handoff.reason
          ? { 'Handoff reason': turn.handoff.reason }
          : {}),
        ...(turn.disqualified.value && turn.disqualified.reason
          ? { 'Not a fit because': turn.disqualified.reason }
          : {}),
      },
    },
    ...(STATUS_TEXT[status] && (status !== lead.status || applied.becameQualified)
      ? [
          {
            ...log,
            source: 'lead' as const,
            kind: `lead.${status}`,
            message: `${STATUS_TEXT[status]} · score ${scored.score} (${scored.grade})`,
          },
        ]
      : []),
  ]);

  // Still qualifying: follow up if the lead goes quiet. Otherwise the conversation is done.
  if (waMessageId && status === 'engaged' && !applied.aiPaused) {
    await startFollowUps(deps.followUps, {
      tenantId: job.tenantId,
      leadId: job.leadId,
      config: playbook.config,
      message: stored,
      activity: deps.activity,
    });
  } else if (status !== 'engaged' || applied.aiPaused) {
    await deps.followUps?.cancel(job.leadId);
  }

  logger.info(
    {
      ...log,
      status,
      changed: applied.changed,
      rejected: applied.rejected.length,
      model: usage.model,
      latencyMs: usage.latencyMs,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    },
    waMessageId ? 'AI replied' : 'AI reply failed to send',
  );
  return waMessageId ? 'replied' : 'send_failed';
}

async function createTenantClient(
  deps: RespondDeps,
  tenantId: string,
  phoneNumberId: string,
): Promise<AgentMessagingClient | null> {
  if (!deps.masterKey) {
    deps.logger.warn({ tenantId }, 'ENCRYPTION_MASTER_KEY missing: cannot decrypt token');
    return null;
  }
  const [account] = await withTenant(deps.db, tenantId, (tx) =>
    tx
      .select({ accessTokenEnc: whatsappAccounts.accessTokenEnc })
      .from(phoneNumbers)
      .innerJoin(whatsappAccounts, eq(phoneNumbers.whatsappAccountId, whatsappAccounts.id))
      .where(eq(phoneNumbers.phoneNumberId, phoneNumberId))
      .limit(1),
  );
  if (!account) {
    deps.logger.warn({ tenantId, phoneNumberId }, 'No WhatsApp account for phone number');
    return null;
  }
  return deps.createClient(decryptSecret(account.accessTokenEnc, deps.masterKey));
}
