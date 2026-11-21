import type { AiModel } from '@qualify/shared';

/** "$0.075", "$0.75", "$4.5" → "$4.50", "$20". */
export function money(value: number): string {
  if (value === 0) return '$0';
  if (value < 0.1) return `$${value.toFixed(3)}`;
  if (value < 1) return `$${value.toFixed(2)}`;
  return `$${value.toFixed(2).replace(/\.00$/, '')}`;
}

/** "GPT-5.4 mini · $0.75 in / $4.50 out" (per 1M tokens). */
export function modelLabel(
  model: Pick<AiModel, 'id' | 'label' | 'inputUsd' | 'outputUsd'>,
): string {
  return `${model.label ?? model.id} · ${money(model.inputUsd)} in / ${money(model.outputUsd)} out`;
}
