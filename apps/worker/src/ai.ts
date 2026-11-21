import { aiCostUsd } from '@qualify/core';
import { cachedAiPrices, type Database, loadAiTenantState, recordAiUsage } from '@qualify/db';
import { type AiResolver, createAiResolver, type ReasoningEffort } from '@qualify/integrations';
import type { Logger } from './logger.ts';

/**
 * The worker's AI resolver (D-094): each workspace's own key or AppsDemo's (OPENAI_API_KEY), the
 * model it chose, the monthly limit, and a usage row per call.
 */
export function createWorkerAi(options: {
  db: Database;
  logger: Pick<Logger, 'warn'>;
  platformKey: string | null;
  masterKey: Buffer | null;
  defaultModel: string;
  reasoningEffort: ReasoningEffort;
}): AiResolver {
  const { db, logger } = options;
  const prices = cachedAiPrices(db);
  return createAiResolver({
    provider: 'openai',
    platformKey: options.platformKey,
    masterKey: options.masterKey,
    defaultModel: options.defaultModel,
    reasoningEffort: options.reasoningEffort,
    load: (tenantId) => loadAiTenantState(db, tenantId),
    costOf: async (usage) => aiCostUsd(usage, await prices().catch(() => undefined)),
    record: async (entry) => {
      const error = await recordAiUsage(db, entry);
      if (error) logger.warn({ err: error, tenantId: entry.tenantId }, 'AI usage not recorded');
    },
  });
}
