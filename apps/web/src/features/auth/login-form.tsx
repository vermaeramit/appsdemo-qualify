import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema } from '@qualify/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { FormAlert } from '@/components/form/form-alert';
import { FormField } from '@/components/form/form-field';
import { PasswordInput } from '@/components/form/password-input';
import { SubmitButton } from '@/components/form/submit-button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { meQueryOptions } from '@/lib/session';
import { authErrorMessage } from './auth-errors';

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signIn.email(values);
    if (error) {
      setFormError(authErrorMessage(error, 'Could not sign you in. Please try again.'));
      return;
    }
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
    await router.navigate({ href: redirectTo });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <FormField id="email" label="Work email" error={errors.email?.message}>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          aria-invalid={Boolean(errors.email)}
          {...form.register('email')}
        />
      </FormField>
      <FormField id="password" label="Password" error={errors.password?.message}>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </FormField>
      <SubmitButton pending={isSubmitting}>Sign in</SubmitButton>
    </form>
  );
}
