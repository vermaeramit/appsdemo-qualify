import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

describe('keyset cursor', () => {
  it('round-trips a microsecond timestamp and an id', () => {
    const cursor = encodeCursor(
      '2026-11-18 10:28:45.220686+00',
      '1aeb37d0-eb7a-4be1-b06b-662b7a11e863',
    );
    expect(decodeCursor(cursor)).toEqual({
      sortKey: '2026-11-18 10:28:45.220686+00',
      id: '1aeb37d0-eb7a-4be1-b06b-662b7a11e863',
    });
    expect(decodeCursor(undefined)).toBeNull();
  });

  it('rejects tampered cursors', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow('Invalid cursor');
    const injected = Buffer.from(JSON.stringify(["now()'); drop table leads; --", 'x'])).toString(
      'base64url',
    );
    expect(() => decodeCursor(injected)).toThrow('Invalid cursor');
  });
});
