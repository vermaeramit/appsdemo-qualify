// Imported first by main.ts. Local dev: the repo-root .env is the source of truth and overrides
// variables already set on the machine (e.g. a stale global OPENAI_API_KEY). Production injects
// real environment variables and has no .env file, so nothing is loaded there.
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

const envFile = resolve(__dirname, '../../../.env');
if (process.env.NODE_ENV !== 'production' && existsSync(envFile)) {
  const overridden: string[] = [];
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    if (process.env[key] !== undefined && process.env[key] !== value) overridden.push(key);
    process.env[key] = value;
  }
  if (overridden.length > 0) {
    console.warn(`[env] .env overrides machine variables: ${overridden.join(', ')}`);
  }
}
