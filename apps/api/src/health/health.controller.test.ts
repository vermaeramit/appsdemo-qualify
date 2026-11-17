import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '@qualify/shared';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns a response that matches the shared contract', () => {
    const response = new HealthController().getHealth();
    expect(healthResponseSchema.safeParse(response).success).toBe(true);
    expect(response.service).toBe('api');
  });
});
