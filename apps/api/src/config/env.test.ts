import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

const valid = {
  APP_DATABASE_URL: 'postgres://qualify_app:pw@localhost:5434/qualify',
  BETTER_AUTH_SECRET: 'x'.repeat(32),
};

describe('loadEnv', () => {
  it('applies defaults for optional values', () => {
    const env = loadEnv(valid);
    expect(env.API_PORT).toBe(3000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.APP_BASE_URL).toBe('http://localhost:5173');
  });

  it('rejects a short auth secret', () => {
    expect(() => loadEnv({ ...valid, BETTER_AUTH_SECRET: 'short' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('requires the app database url', () => {
    expect(() => loadEnv({ BETTER_AUTH_SECRET: 'x'.repeat(32) })).toThrow(/APP_DATABASE_URL/);
  });
});
