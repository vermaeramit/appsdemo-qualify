import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute, redirect } from '@tanstack/react-router';
import { AuthLayout } from '@/features/auth/auth-layout';
import { useSignOut } from '@/features/auth/use-sign-out';
import { CreateWorkspaceForm } from '@/features/onboarding/create-workspace-form';
import { WorkspacePicker } from '@/features/onboarding/workspace-picker';
import { meQueryOptions } from '@/lib/session';

export const Route = createFileRoute('/onboarding')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (!me) throw redirect({ to: '/login' });
    if (me.activeWorkspace) throw redirect({ to: '/' });
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const signOut = useSignOut();
  const workspaces = me?.workspaces ?? [];
  const firstName = me?.user.name.split(' ')[0] ?? 'there';

  return (
    <AuthLayout
      title={`Hi ${firstName}, let's set up your workspace`}
      description="A workspace holds your WhatsApp number, playbooks and leads. You can invite your team later."
      footer={
        <>
          Signed in as {me?.user.email}.{' '}
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-medium text-primary hover:underline"
          >
            Sign out
          </button>
        </>
      }
    >
      <CreateWorkspaceForm />
      {workspaces.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or open an existing workspace
            <span className="h-px flex-1 bg-border" />
          </div>
          <WorkspacePicker workspaces={workspaces} />
        </div>
      )}
    </AuthLayout>
  );
}
