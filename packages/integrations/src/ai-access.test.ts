import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  aiDeniedMessage,
  apiKeyHint,
  type AiTenantState,
  type AiUsageRecord,
  checkOpenAiKey,
  createAiResolver,
  encryptSecret,
  fetchOpenRouterPrices,
  type LlmClient,
} from './index.ts';

const masterKey = randomBytes(32);

function fakeClient(key: string): LlmClient {
  const usage = (model: string) => ({
    model,
    inputTokens: 100,
    cachedInputTokens: 20,
    outputTokens: 10,
    reasoningTokens: 0,
    latencyMs: 5,
  });
  return {
    generateStructured: async (request) => ({
      output: request.schema.parse({ key }),
      usage: usage(request.model),
    }),
    generateText: async (request) => ({ text: key, usage: usage(request.model) }),
  };
}

function setup(state: Partial<AiTenantState>, platformKey: string | null = 'sk-platform') {
  const records: AiUsageRecord[] = [];
  const resolver = createAiResolver({
    provider: 'openai',
    platformKey,
    masterKey,
    defaultModel: 'gpt-default',
    reasoningEffort: 'low',
    load: async () => ({
      mode: 'off',
      apiKeyEnc: null,
      model: null,
      monthlyLimitUsd: null,
      platformSpentUsd: 0,
      ...state,
    }),
    costOf: async () => 0.5,
    record: async (entry) => {
      records.push(entry);
    },
    createClient: fakeClient,
  });
  return { resolver, records };
}

describe('AI resolver (D-094)', () => {
  it('refuses when the AI is off, and says why', async () => {
    const { resolver } = setup({ mode: 'off' });
    const result = await resolver.forTenant('t1', { purpose: 'reply' });
    expect(result).toEqual({ ok: false, reason: 'off' });
    if (!result.ok) expect(aiDeniedMessage(result)).toMatch(/Settings → AI/);
  });

  it("uses the workspace's own key and model, and records each call as its own", async () => {
    const { resolver, records } = setup({
      mode: 'own_key',
      apiKeyEnc: encryptSecret('sk-own-key', masterKey),
      model: 'gpt-chosen',
    });
    const result = await resolver.forTenant('t1', { purpose: 'reply', leadId: 'lead-1' });
    if (!result.ok) throw new Error('expected access');
    expect(result.access).toMatchObject({ model: 'gpt-chosen', keySource: 'own' });
    const { output } = await result.access.llm.generateStructured({
      model: result.access.model,
      system: 's',
      messages: [],
      schema: z.object({ key: z.string() }),
    });
    expect(output.key).toBe('sk-own-key');
    expect(records).toEqual([
      expect.objectContaining({
        tenantId: 't1',
        leadId: 'lead-1',
        purpose: 'reply',
        model: 'gpt-chosen',
        keySource: 'own',
        inputTokens: 100,
        cachedInputTokens: 20,
        outputTokens: 10,
        costUsd: 0.5,
      }),
    ]);
  });

  it('refuses an own key it cannot decrypt', async () => {
    const { resolver } = setup({ mode: 'own_key', apiKeyEnc: 'v1.bad.bad.bad' });
    expect(await resolver.forTenant('t1', { purpose: 'reply' })).toEqual({
      ok: false,
      reason: 'key_unreadable',
    });
  });

  it("uses AppsDemo's key with the default model until the monthly limit is used up", async () => {
    const under = setup({ mode: 'platform', monthlyLimitUsd: 10, platformSpentUsd: 9.99 });
    const ok = await under.resolver.forTenant('t1', { purpose: 'test_chat' });
    if (!ok.ok) throw new Error('expected access');
    expect(ok.access).toMatchObject({ model: 'gpt-default', keySource: 'platform' });
    const { text } = await ok.access.llm.generateText({ model: 'x', system: 's', messages: [] });
    expect(text).toBe('sk-platform');
    expect(under.records[0]).toMatchObject({ keySource: 'platform', purpose: 'test_chat' });

    const over = setup({ mode: 'platform', monthlyLimitUsd: 10, platformSpentUsd: 10 });
    const refused = await over.resolver.forTenant('t1', { purpose: 'reply' });
    expect(refused).toEqual({ ok: false, reason: 'limit', limitUsd: 10, spentUsd: 10 });
    if (!refused.ok) expect(aiDeniedMessage(refused)).toMatch(/\$10/);

    const unlimited = setup({ mode: 'platform', monthlyLimitUsd: null, platformSpentUsd: 500 });
    expect((await unlimited.resolver.forTenant('t1', { purpose: 'reply' })).ok).toBe(true);
    const noKey = setup({ mode: 'platform' }, null);
    expect(await noKey.resolver.forTenant('t1', { purpose: 'reply' })).toEqual({
      ok: false,
      reason: 'no_platform_key',
    });
  });

  it('shows only the end of a key', () => {
    expect(apiKeyHint('sk-proj-abcdefghijklmnop1234')).toBe('sk-proj-…1234');
    expect(apiKeyHint('sk-abcdefghijklmnopwxyz')).toBe('sk-…wxyz');
  });
});

describe('OpenAI key check and price import (D-094)', () => {
  it('tells a good key from a rejected one and from a network problem', async () => {
    const good = vi.fn(async () => Response.json({ data: [{ id: 'gpt-5.4-mini' }] }));
    expect(await checkOpenAiKey('sk-good', good as unknown as typeof fetch)).toEqual({
      ok: true,
      models: ['gpt-5.4-mini'],
    });
    const call = good.mock.calls[0] as unknown as [string, RequestInit];
    expect(call[0]).toBe('https://api.openai.com/v1/models');
    expect((call[1].headers as Record<string, string>).authorization).toBe('Bearer sk-good');

    const rejected = async () => new Response('{}', { status: 401 });
    expect(await checkOpenAiKey('sk-bad', rejected as unknown as typeof fetch)).toMatchObject({
      ok: false,
      reason: 'invalid',
    });
    const down = async () => {
      throw new Error('offline');
    };
    expect(await checkOpenAiKey('sk-x', down as unknown as typeof fetch)).toMatchObject({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('reads OpenAI list prices per 1M tokens from OpenRouter, leaving out variants', async () => {
    const list = async () =>
      Response.json({
        data: [
          {
            id: 'openai/gpt-5.4-mini',
            name: 'OpenAI: GPT-5.4 Mini',
            pricing: {
              prompt: '0.00000075',
              completion: '0.0000045',
              input_cache_read: '0.000000075',
            },
          },
          {
            id: 'openai/gpt-5.4-mini:batch',
            pricing: { prompt: '0.0000004', completion: '0.000002' },
          },
          {
            id: 'openai/gpt-old',
            name: 'OpenAI: Old',
            pricing: { prompt: '0.000001', completion: '0.000002' },
          },
          { id: 'anthropic/other', pricing: { prompt: '0.000001', completion: '0.000002' } },
          { id: 'openai/gpt-oss-120b', pricing: { prompt: '0.0000001', completion: '0.0000005' } },
          {
            id: 'openai/gpt-audio-mini',
            pricing: { prompt: '0.0000006', completion: '0.0000024' },
          },
          { id: 'openai/free-thing' },
        ],
      });
    expect(await fetchOpenRouterPrices(list as unknown as typeof fetch)).toEqual([
      {
        id: 'gpt-5.4-mini',
        label: 'GPT-5.4 Mini',
        inputUsd: 0.75,
        cachedUsd: 0.075,
        outputUsd: 4.5,
      },
      { id: 'gpt-old', label: 'Old', inputUsd: 1, cachedUsd: 1, outputUsd: 2 },
    ]);
  });
});
