import fs from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const SITE_KEYS = [
  'VITE_SITE_URL',
  'VITE_SITE_WHATSAPP_NUMBER',
  'VITE_SITE_PRODUCT_NAME',
  'VITE_SITE_APP_URL',
  'VITE_SITE_COMPANY_NAME',
  'VITE_SITE_SOCIAL_LINKS',
] as const;

/**
 * Website settings: VITE_SITE_* from the environment (Docker build arguments) or, in development,
 * from the repo's .env. Only these keys are read: the .env also sets NODE_ENV=development, which
 * would otherwise turn a build into a development build.
 */
function siteSettings(): Record<string, string> {
  const fromFile: Record<string, string> = {};
  const file = path.resolve(import.meta.dirname, '../../.env');
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const match = /^\s*(VITE_SITE_[A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (match) fromFile[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return Object.fromEntries(SITE_KEYS.map((key) => [key, process.env[key] ?? fromFile[key] ?? '']));
}

// The marketing website (D-101). Production serves it at the domain's root, with its files under
// /site/ so they never collide with the dashboard's /assets/.
export default defineConfig(({ command }) => {
  const settings = siteSettings();
  return {
    base: command === 'build' ? '/site/' : '/',
    envDir: false,
    plugins: [react(), tailwindcss()],
    define: {
      ...Object.fromEntries(
        Object.entries(settings).map(([key, value]) => [
          `import.meta.env.${key}`,
          JSON.stringify(value),
        ]),
      ),
      // The same year in the pre-rendered HTML and in the browser (no hydration mismatch).
      __BUILD_YEAR__: JSON.stringify(new Date().getFullYear()),
    },
    server: {
      port: 5174,
      proxy: {
        // "Open dashboard" for a signed-in visitor: the same /api/me the dashboard uses.
        '/api': 'http://localhost:3000',
      },
    },
  };
});
