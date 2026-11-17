import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { AuthLayout } from '@/features/auth/auth-layout';
import { LoginForm } from '@/features/auth/login-form';
import { meQueryOptions, safeRedirect } from '@/lib/session';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (me) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const { redirect: target } = Route.useSearch();
  return (
    <AuthLayout
      title="Welcome back"
      description="Sign in to see how your leads are being qualified."
      footer={
        <>
          New to AppsDemo Qualify?{' '}
          <Link to="/signup" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm redirectTo={safeRedirect(target)} />
    </AuthLayout>
  );
}
