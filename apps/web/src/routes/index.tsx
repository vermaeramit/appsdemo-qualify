import { createFileRoute, redirect } from '@tanstack/react-router';

/**
 * The domain's root is the marketing website (D-101, apps/site, served by Caddy in production).
 * Inside the dashboard, or in development where the site runs on its own port, "/" opens the
 * dashboard.
 */
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' });
  },
});
