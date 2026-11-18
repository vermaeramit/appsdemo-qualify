/**
 * OpenAI list prices in USD per 1M tokens (input, cached input, output), used to estimate what
 * each AI reply cost from its stored token usage. Source: OpenAI pricing page, checked
 * 2026-11-18. Update this table (and the date) when prices change or a new model is configured.
 * gpt-4.1-mini is an older list price and may be out of date.
 */
export const AI_PRICES_AS_OF = '2026-11-18';

export const AI_PRICES: Readonly<
  Record<string, { input: number; cached: number; output: number }>
> = {
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
function priceFor(model: string) {
  if (AI_PRICES[model]) return AI_PRICES[model];
  const base = Object.keys(AI_PRICES)
    .sort((a, b) => b.length - a.length)
    .find((name) => model.startsWith(`${name}-`));
  return base ? AI_PRICES[base] : undefined;
}

/** Estimated USD cost of one model call; null when the model has no known price. */
export function aiCostUsd(usage: TokenUsage): number | null {
  const price = priceFor(usage.model);
  if (!price) return null;
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    (uncached * price.input +
      usage.cachedInputTokens * price.cached +
      usage.outputTokens * price.output) /
    1_000_000
  );
}
