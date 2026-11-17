// Used only to (re)generate the Better Auth tables in packages/db/src/schema/auth.ts:
//   pnpm --filter @qualify/api auth:schema
// Keep the plugin list in sync with src/auth/auth.ts (hooks don't affect the schema).
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';

export const auth = betterAuth({
  database: drizzleAdapter({} as never, { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
