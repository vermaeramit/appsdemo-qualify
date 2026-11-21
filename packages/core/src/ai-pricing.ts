/**
 * Starting OpenAI list prices in USD per 1M tokens (input, cached input, output). Since D-094 the
 * live price list is the `ai_models` table (platform admin → AI models & prices); this table is the
 * fallback for scripts and tests (agent eval). Checked 2026-11-18.
 */
export const AI_PRICES_AS_OF = '2026-11-18';

export type AiPrices = Readonly<Record<string, { input: number; cached: number; output: number }>>;

export const AI_PRICES: AiPrices = {
  'gpt-5.4-nano': { input: 0.2, cached: 0.02, output: 1.25 },
  'gpt-5.4-mini': { input: 0.75, cached: 0.075, output: 4.5 },
  'gpt-5.5': { input: 5, cached: 0.5, output: 30 },
  'gpt-4.1-mini': { input: 0.4, cached: 0.1, output: 1.6 },
};

export interface TokenUsage {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

/** Price for a model id, also for dated snapshots ("gpt-5.4-mini-2026-03-05"). */
function priceFor(model: string, prices: AiPrices) {
  if (prices[model]) return prices[model];
  const base = Object.keys(prices)
    .sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(`${name}-`));
  return base ? prices[base] : undefined;
}

/** Estimated USD cost of one model call; null when the model has no known price. */
export function aiCostUsd(usage: TokenUsage, prices: AiPrices = AI_PRICES): number | null {
  const price = priceFor(usage.model, prices);
  if (!price) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (uncached * price.input +
      usage.cachedInputTokens * price.cached +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
