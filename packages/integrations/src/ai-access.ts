import { z } from 'zod';
import { decryptSecret } from './crypto.ts';
import { createLlmClient, type LlmClient, type LlmUsage, type ReasoningEffort } from './llm.ts';

/**
 * AI provider per workspace (D-094). Every AI call asks the resolver first: it picks the
 * workspace's own OpenAI key or AppsDemo's key, the model, refuses when the AI is off or the
 * monthly limit on AppsDemo's key is used up, and records each call's tokens and cost.
 */
export type AiMode = 'off' | 'own_key' | 'platform';
export type AiKeySource = 'own' | 'platform';
export type AiPurpose = 'reply' | 'follow_up' | 'summary' | 'form_mapping' | 'test_chat';

export interface AiTenantState {
  mode: AiMode;
  apiKeyEnc: string | null;
  model: string | null;
  monthlyLimitUsd: number | null;
  /** This month's spend on AppsDemo's key (only needed when a limit is set). */
  platformSpentUsd: number;
}

export interface AiUsageRecord {
  tenantId: string;
  leadId: string | null;
  purpose: AiPurpose;
  model: string;
  keySource: AiKeySource;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

export interface AiResolverConfig {
  provider: 'openai';
  /** AppsDemo's own key (OPENAI_API_KEY): used for workspaces a platform admin switched on. */
  platformKey: string | null;
  masterKey: Buffer | null;
  /** Used when a workspace hasn't chosen a model. */
  defaultModel: string;
  reasoningEffort: ReasoningEffort;
  load(tenantId: string): Promise<AiTenantState>;
  costOf(usage: LlmUsage): Promise<number | null>;
  /** Must not throw. */
  record(entry: AiUsageRecord): Promise<void>;
  /** Tests inject a fake client. */
  createClient?: (apiKey: string) => LlmClient;
}

export type AiDeniedReason = 'off' | 'limit' | 'no_platform_key' | 'key_unreadable';

export interface AiAccess {
  /** Records every call it makes. */
  llm: LlmClient;
  model: string;
  reasoningEffort: ReasoningEffort;
  keySource: AiKeySource;
  costOf(usage: LlmUsage): Promise<number | null>;
}

export type AiResolution =
  | { ok: true; access: AiAccess }
  | { ok: false; reason: AiDeniedReason; limitUsd?: number; spentUsd?: number };

export interface AiResolver {
  forTenant(
    tenantId: string,
    use: { purpose: AiPurpose; leadId?: string | null },
  ): Promise<AiResolution>;
}

/** A plain-language reason for a refusal, for activity entries and api errors. */
export function aiDeniedMessage(resolution: Extract<AiResolution, { ok: false }>): string {
  switch (resolution.reason) {
    case 'off':
      return 'the AI is off for this workspace (add an OpenAI key in Settings → AI, or ask AppsDemo to switch it on)';
    case 'limit':
      return `this month's AI limit ($${resolution.limitUsd ?? 0}) on AppsDemo's key is used up`;
    case 'no_platform_key':
      return "AppsDemo's AI key is not set on the server";
    case 'key_unreadable':
      return "the workspace's saved OpenAI key can't be read (save it again in Settings → AI)";
  }
}

export function createAiResolver(config: AiResolverConfig): AiResolver {
  const makeClient =
    config.createClient ??
    ((apiKey: string) => createLlmClient({ provider: config.provider, apiKey }));

  return {
    async forTenant(tenantId, use) {
      const state = await config.load(tenantId);
      let apiKey: string;
      let keySource: AiKeySource;
      if (state.mode === 'own_key') {
        if (!state.apiKeyEnc || !config.masterKey) return { ok: false, reason: 'key_unreadable' };
        try {
          apiKey = decryptSecret(state.apiKeyEnc, config.masterKey);
        } catch {
          return { ok: false, reason: 'key_unreadable' };
        }
        keySource = 'own';
      } else if (state.mode === 'platform') {
        if (!config.platformKey) return { ok: false, reason: 'no_platform_key' };
        if (state.monthlyLimitUsd !== null && state.platformSpentUsd >= state.monthlyLimitUsd) {
          return {
            ok: false,
            reason: 'limit',
            limitUsd: state.monthlyLimitUsd,
            spentUsd: state.platformSpentUsd,
          };
        }
        apiKey = config.platformKey;
        keySource = 'platform';
      } else {
        return { ok: false, reason: 'off' };
      }

      const inner = makeClient(apiKey);
      const record = async (usage: LlmUsage) => {
        await config.record({
          tenantId,
          leadId: use.leadId ?? null,
          purpose: use.purpose,
          model: usage.model,
          keySource,
          inputTokens: usage.inputTokens,
          cachedInputTokens: usage.cachedInputTokens,
          outputTokens: usage.outputTokens,
          costUsd: await config.costOf(usage),
        });
      };
      const llm: LlmClient = {
        async generateStructured(request) {
          const result = await inner.generateStructured(request);
          await record(result.usage);
          return result;
        },
        async generateText(request) {
          const result = await inner.generateText(request);
          await record(result.usage);
          return result;
        },
      };
      return {
        ok: true,
        access: {
          llm,
          model: state.model ?? config.defaultModel,
          reasoningEffort: config.reasoningEffort,
          keySource,
          costOf: config.costOf,
        },
      };
    },
  };
}

/** "sk-proj-…abcd": enough to tell keys apart, never enough to use one. */
export function apiKeyHint(apiKey: string): string {
  const prefix = apiKey.startsWith('sk-proj-') ? 'sk-proj-' : 'sk-';
  return `${prefix}…${apiKey.slice(-4)}`;
}

const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models';

export type OpenAiKeyCheck =
  | { ok: true; models: string[] }
  | { ok: false; reason: 'invalid' | 'unreachable'; message: string };

/** Checks a key with OpenAI (lists the models it can use; costs nothing). */
export async function checkOpenAiKey(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenAiKeyCheck> {
  let response: Response;
  try {
    response = await fetchImpl(OPENAI_MODELS_URL, {
      headers: { authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    return { ok: false, reason: 'unreachable', message: "Couldn't reach OpenAI. Try again." };
  }
  if (response.status === 401 || response.status === 403) {
    return { ok: false, reason: 'invalid', message: 'OpenAI rejected this key.' };
  }
  if (!response.ok) {
    return {
      ok: false,
      reason: 'unreachable',
      message: `OpenAI answered ${response.status}. Try again.`,
    };
  }
  const body = z
    .object({ data: z.array(z.object({ id: z.string() })) })
    .safeParse(await response.json().catch(() => null));
  return { ok: true, models: body.success ? body.data.data.map((model) => model.id) : [] };
}

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';

const openRouterSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      pricing: z
        .object({
          prompt: z.coerce.number(),
          completion: z.coerce.number(),
          input_cache_read: z.coerce.number().optional(),
        })
        .partial()
        .optional(),
    }),
  ),
});

export interface ImportedPrice {
  id: string;
  label: string | null;
  inputUsd: number;
  cachedUsd: number;
  outputUsd: number;
}

const perMillion = (perToken: number) => Math.round(perToken * 1_000_000 * 1_000_000) / 1_000_000;

/**
 * Current OpenAI list prices from OpenRouter's public model list (no key needed; its prices for
 * OpenAI models are OpenAI's own). Batch and variant entries ("openai/x:batch") are left out.
 */
export async function fetchOpenRouterPrices(
  fetchImpl: typeof fetch = fetch,
): Promise<ImportedPrice[]> {
  const response = await fetchImpl(OPENROUTER_MODELS_URL, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`OpenRouter answered ${response.status}`);
  const parsed = openRouterSchema.parse(await response.json());
  const prices: ImportedPrice[] = [];
  for (const model of parsed.data) {
    if (!model.id.startsWith('openai/') || model.id.includes(':')) continue;
    const id = model.id.slice('openai/'.length);
    const { prompt, completion, input_cache_read: cached } = model.pricing ?? {};
    if (!/^[a-z0-9][a-z0-9.-]*$/i.test(id) || prompt === undefined || completion === undefined) {
      continue;
    }
    if (prompt < 0 || completion < 0) continue;
    prices.push({
      id,
      label: model.name?.replace(/^OpenAI:\s*/, '') ?? null,
      inputUsd: perMillion(prompt),
      cachedUsd: perMillion(cached ?? prompt),
      outputUsd: perMillion(completion),
    });
  }
  return prices.sort((a, b) => a.id.localeCompare(b.id));
}
