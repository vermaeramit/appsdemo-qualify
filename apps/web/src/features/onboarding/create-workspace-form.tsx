import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWorkspaceSchema } from '@qualify/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form/form-alert';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Input } from '@/components/ui/input';
import { authClient } from '@/lib/auth-client';
import { meQueryOptions } from '@/lib/session';
import { workspaceSlug } from '@/lib/workspace';
import { authErrorMessage } from '../auth/auth-errors';

export function CreateWorkspaceForm() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name }) => {
    setFormError(null);
    const created = await authClient.organization.create({ name, slug: workspaceSlug(name) });
    if (created.error || !created.data) {
      setFormError(
        authErrorMessage(created.error ?? {}, 'Could not create the workspace. Please try again.'),
      );
      return;
    }
    const activated = await authClient.organization.setActive({ organizationId: created.data.id });
    if (activated.error) {
      setFormError(authErrorMessage(activated.error, 'Workspace created, but could not open it.'));
      return;
    }
    toast.success(`${name} is ready`);
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: '/' });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <FormField
        id="workspace-name"
        label="Workspace name"
        error={errors.name?.message}
        hint="Usually your company or brand, e.g. Sunrise Holidays"
      >
        <Input
          id="workspace-name"
          autoComplete="organization"
          placeholder="Sunrise Holidays"
          aria-invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
      </FormField>
      <SubmitButton pending={isSubmitting}>Create workspace</SubmitButton>
    </form>
  );
}
