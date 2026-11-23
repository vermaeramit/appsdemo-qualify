import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { AuthLayout } from '@/features/auth/auth-layout';
import { SignupForm } from '@/features/auth/signup-form';
import { meQueryOptions } from '@/lib/session';

export const Route = createFileRoute('/signup')({
  beforeLoad: async ({ context }) => {
    const me = await context.queryClient.ensureQueryData(meQueryOptions);
    if (me) throw redirect({ to: '/dashboard' });
  },
  component: SignupPage,
});

function SignupPage() {
  return (
    <AuthLayout
      title="Create your account"
      description="Start qualifying your Meta leads on WhatsApp in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignupForm />
    </AuthLayout>
  );
}
