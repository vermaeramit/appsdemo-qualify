import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/** Better Auth client. Same origin, default base path /api/auth (proxied to the api). */
export const authClient = createAuthClient({
  plugins: [organizationClient()],
});
