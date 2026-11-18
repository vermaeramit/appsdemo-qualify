import { describe, expect, it } from 'vitest';
import { safeTimeZone } from './dashboard.controller';

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
