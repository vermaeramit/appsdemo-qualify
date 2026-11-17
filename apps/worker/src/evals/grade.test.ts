import { describe, expect, it } from 'vitest';
import { checkField, parseAmounts, parseTravelers } from './grade.ts';

describe('eval grading helpers', () => {
  it('parses Indian amount formats', () => {
    expect(parseAmounts('70000-80000 INR total')).toEqual([70000, 80000]);
    expect(parseAmounts('1.5 lakh')).toEqual([150000]);
    expect(parseAmounts('₹2,00,000 total')).toEqual([200000]);
    expect(parseAmounts('70k for both')).toEqual([70000]);
    expect(parseAmounts('25000 INR per person')).toEqual([25000]);
  });

  it('parses traveler counts', () => {
    expect(parseTravelers('2 adults, 2 children (8, 5)')).toEqual({ adults: 2, children: 2 });
    expect(parseTravelers('4 adults')).toEqual({ adults: 4, children: 0 });
    expect(parseTravelers('2 adults, 1 child (6)')).toEqual({ adults: 2, children: 1 });
  });

  it('checks fields by mode', () => {
    expect(
      checkField({ key: 'budget', expect: '70000-80000', mode: 'amount' }, '75000 INR total'),
    ).toBe(true);
    expect(
      checkField({ key: 'budget', expect: '100000', mode: 'amount' }, '190000 INR total'),
    ).toBe(false);
    expect(
      checkField({ key: 'destination', expect: 'Bali', mode: 'contains' }, 'Bali, Indonesia'),
    ).toBe(true);
    expect(checkField({ key: 'travel_month', expect: '2026-12', mode: 'exact' }, '2027-12')).toBe(
      false,
    );
    expect(
      checkField({ key: 'travelers', expect: '2 adults', mode: 'travelers' }, '2 adults'),
    ).toBe(true);
    expect(checkField({ key: 'destination', expect: 'Bali', mode: 'contains' }, undefined)).toBe(
      false,
    );
  });
});
