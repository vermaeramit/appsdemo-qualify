import {
  applyAgentTurn,
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
  getDefaultPublishedPlaybook,
  getPlaybookVersion,
  leads,
  messages,
  phoneNumbers,
  tenants,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import {
  decryptSecret,
  isAllowedRecipient,
  type LlmClient,
  type LlmUsage,
  type ReasoningEffort,
  toWaId,
} from '@qualify/integrations';
import {
  type AgentLanguage,
  agentLanguageSchema,
  type AgentTurn,
  agentTurnSchema,
  type RespondJob,
} from '@qualify/shared';
import type { LeadLock } from '../lock.ts';
import { type FollowUpScheduler, startFollowUps } from './follow-up.ts';
import { type AgentMessagingClient, sendWithOptions } from './send.ts';
import type { Logger } from '../logger.ts';

export type { AgentMessagingClient } from './send.ts';

export interface RespondDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  /** Null when no AI provider is configured: the agent stays silent. */
  llm: LlmClient | null;
  model: string;
  reasoningEffort: ReasoningEffort;
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
  return locked.result;
}

async function respond(job: RespondJob, deps: RespondDeps): Promise<RespondOutcome> {
  const { db, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const log = { tenantId: job.tenantId, leadId: job.leadId };

  if (!deps.llm) return 'skipped_no_ai';

  // 1. Load everything we need in one tenant-scoped transaction.
  const context = await withTenant(db, job.tenantId, async (tx) => {
    const [lead] = await tx.select().from(leads).where(eq(leads.id, job.leadId)).limit(1);
    if (!lead) return null;
    const [tenant] = await tx.select().from(tenants).limit(1);
    const playbook = lead.playbookVersionId
      ? await getPlaybookVersion(tx, lead.playbookVersionId)
      : await getDefaultPublishedPlaybook(tx);
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

  // 3. WhatsApp client for this tenant's number (+ "typing…" while we think).
  const client = await createTenantClient(deps, job.tenantId, latestInbound.phoneNumberId);
  if (!client) return 'send_failed';
  if (latestInbound.waMessageId) {
    await client
      .markRead(latestInbound.phoneNumberId, latestInbound.waMessageId, { typing: true })
      .catch((error: unknown) => logger.warn({ ...log, err: error }, 'Typing indicator failed'));
  }

  // 4. Ask the model for the next turn.
  const allowedLanguages = (tenant?.allowedLanguages ?? ['hinglish', 'en', 'hi'])
    .map((code) => agentLanguageSchema.safeParse(code))
    .flatMap((parsed) => (parsed.success ? [parsed.data] : []));
  const defaultLanguage: AgentLanguage =
    agentLanguageSchema.safeParse(tenant?.defaultLanguage).data ?? 'hinglish';
  const definitions = playbook.config.fields;
  const replyLanguage = chooseReplyLanguage({
    latestLeadText: latestInbound.body,
    previous: lead.language,
    allowed: allowedLanguages.length ? allowedLanguages : ['hinglish', 'en', 'hi'],
    fallback: defaultLanguage,
  });

  let turn: AgentTurn;
  let usage: LlmUsage;
  try {
    ({ output: turn, usage } = await deps.llm.generateStructured({
      model: deps.model,
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
      }),
      schema: agentTurnSchema,
      reasoningEffort: deps.reasoningEffort,
      cacheKey: `playbook:${playbook.versionId}`,
    }));
  } catch (error) {
    logger.error({ ...log, err: error }, 'AI turn failed');
    throw error; // BullMQ retries
  }

  // 5. The lead may have written again while the model was thinking: answer the newest state.
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

  // 6. Apply the turn (same pure logic the eval harness uses).
  const applied = applyAgentTurn(definitions, lead, turn, replyLanguage);
  const { reply, options, status } = applied;
  const updates: Partial<typeof leads.$inferInsert> = {};
  if (applied.becameQualified) updates.qualifiedAt = now();
  if (applied.handedOff) updates.handoffAt = now();

  // 7. Send.
  const sent = await sendWithOptions(client, {
    phoneNumberId: latestInbound.phoneNumberId,
    to: toWaId(lead.phoneE164),
    body: reply,
    options,
  });
  const waMessageId = sent.waMessageId;
  if (sent.error) logger.error({ ...log, error: sent.error }, 'Failed to send AI reply');

  // 8. Persist the reply and the lead's new state.
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
        fields: applied.fields,
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

  // Still qualifying: follow up if the lead goes quiet. Otherwise the conversation is done.
  if (waMessageId && status === 'engaged' && !applied.aiPaused) {
    await startFollowUps(deps.followUps, {
      tenantId: job.tenantId,
      leadId: job.leadId,
      config: playbook.config,
      message: stored,
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
