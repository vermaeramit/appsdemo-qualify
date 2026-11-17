// Imported first by main.ts. Local dev: load the repo-root .env before anything reads
// process.env. Production injects real environment variables, so no file is expected there.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(__dirname, '../../../.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
