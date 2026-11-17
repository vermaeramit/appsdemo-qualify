import { describe, expect, it } from 'vitest';
import { isAllowedOrigin } from './origin-check';

const app = 'http://localhost:5173';

describe('isAllowedOrigin', () => {
  it('allows safe methods without an origin', () => {
    expect(isAllowedOrigin('GET', {}, app)).toBe(true);
  });

  it('allows writes from the dashboard origin', () => {
    expect(isAllowedOrigin('POST', { origin: 'http://localhost:5173' }, app)).toBe(true);
    expect(isAllowedOrigin('DELETE', { referer: 'http://localhost:5173/leads?x=1' }, app)).toBe(
      true,
    );
  });

  it('rejects writes from other origins or without an origin', () => {
    expect(isAllowedOrigin('POST', { origin: 'https://evil.example' }, app)).toBe(false);
    expect(isAllowedOrigin('POST', {}, app)).toBe(false);
    expect(isAllowedOrigin('PATCH', { origin: 'not a url' }, app)).toBe(false);
  });
});
