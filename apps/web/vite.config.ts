import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    // Must come before react(): generates src/routeTree.gen.ts and splits every route into its own chunk.
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    // Dev only: lets a Cloudflare quick tunnel reach the dev server (Meta webhooks via /api).
    allowedHosts: ['.trycloudflare.com'],
    proxy: {
      // Same-origin in dev too: the browser calls /api, Vite forwards to the NestJS api.
      '/api': 'http://localhost:3000',
    },
  },
});
