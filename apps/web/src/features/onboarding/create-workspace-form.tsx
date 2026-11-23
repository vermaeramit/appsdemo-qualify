import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { createWorkspaceSchema } from '@qualify/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { DEFAULT_TEMPLATE_KEY, PLAYBOOK_TEMPLATES } from '@qualify/core';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form/form-alert';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
    defaultValues: { name: '', template: DEFAULT_TEMPLATE_KEY },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, template }) => {
    setFormError(null);
    const created = await authClient.organization.create({
      name,
      slug: workspaceSlug(name),
      metadata: { template },
    });
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
    await navigate({ to: '/dashboard' });
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <FormField
        id="workspace-name"
        label="Workspace name"
        error={errors.name?.message}
        hint="Usually your company or brand name"
      >
        <Input
          id="workspace-name"
          autoComplete="organization"
          placeholder="e.g. Acme Solutions"
          aria-invalid={Boolean(errors.name)}
          {...form.register('name')}
        />
      </FormField>
      <div className="space-y-1.5">
        <Label htmlFor="workspace-template">What does your business do?</Label>
        <Controller
          control={form.control}
          name="template"
          render={({ field }) => (
            <Select value={field.value} onValueChange={field.onChange}>
              <SelectTrigger id="workspace-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAYBOOK_TEMPLATES.map((template) => (
                  <SelectItem key={template.key} value={template.key}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-muted-foreground">
          Sets up the AI agent’s first questions. You can change everything later.
        </p>
      </div>
      <SubmitButton pending={isSubmitting}>Create workspace</SubmitButton>
    </form>
  );
}
