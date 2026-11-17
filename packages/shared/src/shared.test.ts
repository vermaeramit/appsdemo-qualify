import { describe, expect, it } from 'vitest';
import { healthResponseSchema, leadGradeSchema, leadScoreSchema } from './index.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health response', () => {
    const parsed = healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
      version: '0.0.0',
      time: new Date().toISOString(),
    });
    expect(parsed.status).toBe('ok');
  });

  it('rejects a non-ISO time', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: 'api',
      version: '0.0.0',
      time: 'yesterday',
    });
    expect(result.success).toBe(false);
  });
});

describe('lead schemas', () => {
  it('only allows known grades', () => {
    expect(leadGradeSchema.safeParse('hot').success).toBe(true);
    expect(leadGradeSchema.safeParse('lukewarm').success).toBe(false);
  });

  it('keeps scores between 0 and 100', () => {
    expect(leadScoreSchema.safeParse(86).success).toBe(true);
    expect(leadScoreSchema.safeParse(101).success).toBe(false);
    expect(leadScoreSchema.safeParse(42.5).success).toBe(false);
  });
});
