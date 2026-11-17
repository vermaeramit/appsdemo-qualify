import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpSchema } from '@qualify/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { FormAlert } from '@/components/form/form-alert';
import { FormField } from '@/components/form/form-field';
import { PasswordInput } from '@/components/form/password-input';
import { SubmitButton } from '@/components/form/submit-button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { meQueryOptions } from '@/lib/session';
import { authErrorMessage } from './auth-errors';

export function SignupForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const { error } = await authClient.signUp.email(values);
    if (error) {
      setFormError(authErrorMessage(error, 'Could not create your account. Please try again.'));
      return;
    }
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: '/onboarding' });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <FormField id="name" label="Full name" error={errors.name?.message}>
        <Input
          id="name"
          autoComplete="name"
          placeholder="Amit Kumar"
          aria-invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
      </FormField>
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
      <FormField
        id="password"
        label="Password"
        error={errors.password?.message}
        hint="At least 8 characters"
      >
        <PasswordInput
          id="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          {...form.register('password')}
        />
      </FormField>
      <SubmitButton pending={isSubmitting}>Create account</SubmitButton>
    </form>
  );
}
