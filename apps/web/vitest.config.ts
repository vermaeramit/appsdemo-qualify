import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Unit tests only. Browser end-to-end tests live in e2e/ and run with `pnpm test:e2e`.
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
