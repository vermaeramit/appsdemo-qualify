import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    // Testcontainers needs time to pull/start Postgres on the first run.
    hookTimeout: 180_000,
  },
});
