import { Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import {
  aiCostUsd,
  applyAgentTurn,
  buildStateNote,
  buildSystemPrompt,
  chooseReplyLanguage,
  type HistoryMessage,
  leadScoreColumns,
  localToday,
  prefillMode,
  toModelHistory,
} from '@qualify/core';
import { type DbHandle, getDefaultPublishedPlaybook, tenants, withTenant } from '@qualify/db';
import { createLlmClient, type LlmClient } from '@qualify/integrations';
import {
  type AgentLanguage,
  agentLanguageSchema,
  agentTurnSchema,
  type SimulateRequest,
  type SimulateResponse,
  simulateResponseSchema,
} from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

const ALL_LANGUAGES: AgentLanguage[] = ['hinglish', 'en', 'hi'];

/**
 * Test chat (M5): one agent turn with the same pure logic as the live agent (prompt, state note,
 * applyAgentTurn, WhatsApp options, scoring). Nothing is sent or stored.
 */
@Injectable()
export class SimulatorService {
  private readonly llm: LlmClient | null;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.llm = env.OPENAI_API_KEY
      ? createLlmClient({ provider: env.LLM_PROVIDER, apiKey: env.OPENAI_API_KEY })
      : null;
  }

  async simulate(workspace: WorkspaceContext, input: SimulateRequest): Promise<SimulateResponse> {
    if (!this.llm) {
      throw new ServiceUnavailableException('The AI is not configured on the server.');
    }
    const { config, tenant } = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [tenant] = await tx.select().from(tenants).limit(1);
      const config = input.config ?? (await getDefaultPublishedPlaybook(tx))?.config;
      return { config, tenant };
    });
    if (!config) throw new ServiceUnavailableException('Publish the AI agent first.');

    const allowed = (tenant?.allowedLanguages ?? ALL_LANGUAGES).flatMap((code) => {
      const parsed = agentLanguageSchema.safeParse(code);
      return parsed.success ? [parsed.data] : [];
    });
    const allowedLanguages = allowed.length ? allowed : ALL_LANGUAGES;
    const defaultLanguage =
      agentLanguageSchema.safeParse(tenant?.defaultLanguage).data ?? 'hinglish';
    const history: HistoryMessage[] = input.messages.map((message) => ({
      direction: message.from === 'lead' ? 'inbound' : 'outbound',
      sender: message.from === 'lead' ? 'lead' : 'ai',
      type: 'text',
      body: message.text,
    }));
    const latestLead = input.messages.filter((message) => message.from === 'lead').at(-1);
    const replyLanguage = chooseReplyLanguage({
      latestLeadText: latestLead?.text ?? null,
      previous: input.language,
      allowed: allowedLanguages,
      fallback: defaultLanguage,
    });
    const timeZone = tenant?.timezone ?? 'Asia/Kolkata';
    const today = localToday(timeZone);

    const { output, usage } = await this.llm.generateStructured({
      model: this.env.AI_MODEL_CHAT,
      reasoningEffort: this.env.AI_REASONING_EFFORT,
      system: buildSystemPrompt(config, { allowedLanguages, defaultLanguage }),
      messages: toModelHistory(history),
      stateNote: buildStateNote({
        today,
        fields: input.fields,
        definitions: config.fields,
        status: input.status,
        leadName: null,
        replyLanguage,
        unconfirmed: input.unconfirmed,
        confirmMode: prefillMode(config),
        asked: input.asked,
      }),
      schema: agentTurnSchema,
      cacheKey: `simulate:${workspace.tenantId}`,
    });
    const applied = applyAgentTurn(
      config.fields,
      {
        fields: input.fields,
        status: input.status,
        unconfirmed: input.unconfirmed,
        asked: input.asked,
      },
      output,
      replyLanguage,
      prefillMode(config),
    );
    const scored = leadScoreColumns({
      config,
      fields: applied.fields,
      signals: applied.signals,
      status: applied.status,
      today,
      final: false,
      now: new Date(),
    });

    return simulateResponseSchema.parse({
      reply: applied.reply,
      options: applied.options,
      fields: applied.fields,
      unconfirmed: applied.unconfirmed,
      confirmed: applied.confirmed,
      confirming: applied.confirming,
      changed: applied.changed,
      rejected: applied.rejected,
      status: applied.status,
      language: applied.language,
      score: { score: scored.score, grade: scored.grade, reason: scored.scoreDetails.reason },
      usage: {
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        costUsd: aiCostUsd(usage),
        latencyMs: usage.latencyMs,
      },
    });
  }
}
