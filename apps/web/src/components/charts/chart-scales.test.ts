import { describe, expect, it } from 'vitest';
import { niceTicks } from './chart-scales';

describe('niceTicks', () => {
  it('uses whole numbers for small counts', () => {
    expect(niceTicks(3, true)).toEqual([0, 1, 2, 3]);
    expect(niceTicks(0, true)).toEqual([0, 1]);
  });

  it('steps by 1, 2 or 5 × 10^n for money and large counts', () => {
    expect(niceTicks(0.8631, false)).toEqual([0, 0.5, 1]);
    expect(niceTicks(0.026, false)).toEqual([0, 0.01, 0.02, 0.03]);
    expect(niceTicks(240, true)).toEqual([0, 100, 200, 300]);
    expect(niceTicks(0, false)).toEqual([0, 1]);
  });
});
