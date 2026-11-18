import { describe, expect, it } from 'vitest';
import { localDay, safeTimeZone } from './time-zone';

describe('safeTimeZone', () => {
  it('keeps valid IANA zones', () => {
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(safeTimeZone('America/New_York')).toBe('America/New_York');
  });

  it('falls back to UTC for anything else', () => {
    expect(safeTimeZone('Not/AZone')).toBe('UTC');
    expect(safeTimeZone("Asia/Kolkata'; drop table leads;--")).toBe('UTC');
    expect(safeTimeZone(undefined)).toBe('UTC');
    expect(safeTimeZone(['Asia/Kolkata'])).toBe('UTC');
    expect(safeTimeZone('x'.repeat(100))).toBe('UTC');
  });
});

describe('localDay', () => {
  it('formats the calendar day in the given zone', () => {
    const instant = new Date('2026-11-17T19:00:00Z');
    expect(localDay(instant, 'Asia/Kolkata')).toBe('2026-11-18');
    expect(localDay(instant, 'UTC')).toBe('2026-11-17');
  });
});
