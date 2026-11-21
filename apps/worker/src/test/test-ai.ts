import { aiCostUsd } from '@qualify/core';
import {
  type AiResolver,
  type AiTenantState,
  type AiUsageRecord,
  createAiResolver,
  type LlmClient,
} from '@qualify/integrations';

/**
 * An AI resolver for tests (D-094): hands out `llm` as AppsDemo's key with no limit, or refuses
 * with "off" when `llm` is null. `state` overrides the workspace's settings (e.g. a used-up
 * limit); `records` collects the usage rows.
 */
export function testAi(
  llm: LlmClient | null,
  options: { model?: string; records?: AiUsageRecord[]; state?: Partial<AiTenantState> } = {},
): AiResolver {
  return createAiResolver({
    provider: 'openai',
    platformKey: 'sk-test-platform',
    masterKey: null,
    defaultModel: options.model ?? 'fake-model',
    reasoningEffort: 'low',
    load: async () => ({
      mode: llm ? 'platform' : 'off',
      apiKeyEnc: null,
      model: null,
      monthlyLimitUsd: null,
      platformSpentUsd: 0,
      ...options.state,
    }),
    costOf: async (usage) => aiCostUsd(usage),
    record: async (entry) => {
      options.records?.push(entry);
    },
    createClient: () => {
      if (!llm) throw new Error('testAi: no client');
      return llm;
    },
  });
}
