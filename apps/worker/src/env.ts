import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_DATABASE_URL: z.string().min(1, 'APP_DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Decrypts tenant WhatsApp tokens. Without it the worker stores messages but cannot reply. */
  ENCRYPTION_MASTER_KEY: optional,
  /** Dev safety switch (D-034): outside production, reply only to these numbers. */
  DEV_ALLOWED_NUMBERS: optional,
  META_GRAPH_VERSION: optional,
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadWorkerEnv(source: Record<string, string | undefined> = process.env): WorkerEnv {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid worker environment:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
