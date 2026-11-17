import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, Navigate, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/layout/app-shell';
import { meQueryOptions } from '@/lib/session';

/** Layout for every signed-in page: requires a session and an active workspace. */
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ context, location }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me) throw redirect({ to: '/login', search: { redirect: location.href } });
    if (!me.activeWorkspace) throw redirect({ to: '/onboarding' });
  },
  component: AppLayout,
});

function AppLayout() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  if (!me?.activeWorkspace) return <Navigate to="/login" />;

  return (
    <AppShell user={me.user} workspace={me.activeWorkspace}>
      <Outlet />
    </AppShell>
  );
}
