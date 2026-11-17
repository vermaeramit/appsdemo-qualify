import type { FieldCheck } from './scenarios.ts';

/** Parses amounts like "70k", "1.5 lakh", "₹2,00,000", "70000-80000 INR" into rupee numbers. */
export function parseAmounts(text: string): number[] {
  const amounts: number[] = [];
  const pattern = /(\d+(?:[.,]\d+)*)\s*(k|thousand|lakh|lakhs|lac|l\b)?/gi;
  for (const match of text.matchAll(pattern)) {
    const raw = match[1]!;
    // Indian grouping "2,00,000" → 200000; decimals "1.5" stay decimal.
    const value = raw.includes('.') ? Number(raw.replace(/,/g, '')) : Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(value)) continue;
    const unit = match[2]?.toLowerCase();
    const multiplier = unit === 'k' || unit === 'thousand' ? 1_000 : unit ? 100_000 : 1;
    const amount = value * multiplier;
    if (amount >= 1_000) amounts.push(amount);
  }
  return amounts;
}

/** Adults/children counts from "2 adults, 1 child (6)" style text. */
export function parseTravelers(text: string): { adults: number; children: number } {
  const lower = text.toLowerCase();
  const adults = Number(lower.match(/(\d+)\s*(adult|people|person|pax|friends?)/)?.[1] ?? 0);
  const children = Number(lower.match(/(\d+)\s*(child|children|kid|kids|bachh?[ae])/)?.[1] ?? 0);
  return { adults, children };
}

export function checkField(check: FieldCheck, actual: string | undefined): boolean {
  if (!actual) return false;
  const a = actual.toLowerCase();
  const e = check.expect.toLowerCase();
  switch (check.mode) {
    case 'exact':
      return a === e;
    case 'contains':
      // 'Europe|Paris|Switzerland' accepts any alternative.
      return e.split('|').some((option) => a.includes(option) || option.includes(a));
    case 'amount': {
      const expected = parseAmounts(check.expect);
      const got = parseAmounts(actual);
      // Pass when any extracted amount is within ±25% of an expected bound.
      return got.some((value) =>
        expected.some((target) => Math.abs(value - target) / target <= 0.25),
      );
    }
    case 'travelers': {
      const expected = parseTravelers(check.expect);
      const got = parseTravelers(actual);
      return got.adults === expected.adults && got.children === expected.children;
    }
  }
}
