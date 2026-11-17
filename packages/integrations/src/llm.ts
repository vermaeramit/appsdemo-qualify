import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import type { z } from 'zod';

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high';

export interface LlmUsage {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  latencyMs: number;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface StructuredRequest<SCHEMA extends z.ZodType> {
  model: string;
  system: string;
  messages: readonly ChatTurn[];
  /** Appended after the conversation as a system message (keeps `system` cacheable). */
  stateNote?: string;
  schema: SCHEMA;
  reasoningEffort?: ReasoningEffort;
  /** Groups requests that share a prompt prefix, improving provider cache hits. */
  cacheKey?: string;
  timeoutMs?: number;
}

export interface TextRequest {
  model: string;
  system: string;
  messages: readonly ChatTurn[];
  reasoningEffort?: ReasoningEffort;
  timeoutMs?: number;
}

export interface LlmClient {
  generateStructured<SCHEMA extends z.ZodType>(
    request: StructuredRequest<SCHEMA>,
  ): Promise<{ output: z.infer<SCHEMA>; usage: LlmUsage }>;
  generateText(request: TextRequest): Promise<{ text: string; usage: LlmUsage }>;
}

/** Reasoning models (gpt-5.x, o-series) accept a reasoning effort; older chat models don't. */
function isReasoningModel(model: string): boolean {
  return /^(gpt-5|gpt-6|o\d)/.test(model);
}

function providerOptions(model: string, effort: ReasoningEffort | undefined, cacheKey?: string) {
  return {
    openai: {
      store: false, // don't keep lead conversations on the provider side
      ...(cacheKey ? { promptCacheKey: cacheKey } : {}),
      ...(isReasoningModel(model) ? { reasoningEffort: effort ?? 'low' } : {}),
    },
  };
}

interface SdkUsage {
  inputTokens: number | undefined;
  outputTokens: number | undefined;
  inputTokenDetails?: { cacheReadTokens: number | undefined };
  outputTokenDetails?: { reasoningTokens: number | undefined };
}

function toUsage(model: string, usage: SdkUsage, startedAt: number): LlmUsage {
  return {
    model,
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
    latencyMs: Date.now() - startedAt,
  };
}

/** Provider-agnostic LLM access (D-021/D-039). Only OpenAI is wired today; OpenRouter is a config away. */
export function createLlmClient(config: { provider: 'openai'; apiKey: string }): LlmClient {
  const openai = createOpenAI({ apiKey: config.apiKey });

  return {
    async generateStructured(request) {
      const startedAt = Date.now();
      const result = await generateText({
        model: openai(request.model),
        system: request.system,
        messages: [
          ...request.messages,
          ...(request.stateNote ? [{ role: 'system' as const, content: request.stateNote }] : []),
        ],
        allowSystemInMessages: true,
        output: Output.object({ schema: request.schema }),
        providerOptions: providerOptions(request.model, request.reasoningEffort, request.cacheKey),
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
      });
      // Re-validate with our schema: typed result, and a second line of defence.
      const output = request.schema.parse(result.output) as z.infer<typeof request.schema>;
      return { output, usage: toUsage(request.model, result.usage, startedAt) };
    },

    async generateText(request) {
      const startedAt = Date.now();
      const result = await generateText({
        model: openai(request.model),
        system: request.system,
        messages: [...request.messages],
        providerOptions: providerOptions(request.model, request.reasoningEffort),
        maxRetries: 2,
        abortSignal: AbortSignal.timeout(request.timeoutMs ?? 60_000),
      });
      return { text: result.text, usage: toUsage(request.model, result.usage, startedAt) };
    },
  };
}
