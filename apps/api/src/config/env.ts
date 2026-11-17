import { z } from 'zod';

const optionalSecret = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  /** Public origin of the dashboard. The API is served under the same origin at /api. */
  APP_BASE_URL: z.url().default('http://localhost:5173'),
  /** Connection as the qualify_app role so RLS applies (never the owner/superuser). */
  APP_DATABASE_URL: z.string().min(1, 'APP_DATABASE_URL is required'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6380'),
  BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  /** Meta webhooks. Optional so the api can run before Meta is configured (webhook → 503). */
  META_APP_SECRET: optionalSecret,
  META_WEBHOOK_VERIFY_TOKEN: optionalSecret,
});

export type Env = z.infer<typeof envSchema>;

/** Parses and validates the environment once at startup. Fails fast with a readable message. */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
