import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  type CreateLeadRequest,
  createLeadRequestSchema,
  createLeadResponseSchema,
  type PlaybookField,
} from '@qualify/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { UserPlus } from 'lucide-react';
import { Controller, type Resolver, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormAlert } from '@/components/form/form-alert';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { playbookQueryOptions } from '@/features/agent/queries';
import { apiSend, errorMessage } from '@/lib/api';

interface AddLeadValues {
  phone: string;
  name: string;
  source: 'meta_form' | 'api';
  campaign: string;
  // Unanswered option questions stay undefined.
  fields: Record<string, string | undefined>;
}

const EMPTY: AddLeadValues = {
  phone: '+91 ',
  name: '',
  source: 'meta_form',
  campaign: '',
  fields: {},
};

/** Blank inputs are "not given"; the rest is validated like the public API. */
function toRequest(values: AddLeadValues): CreateLeadRequest {
  const fields = Object.fromEntries(
    Object.entries(values.fields)
      .map(([key, value]) => [key, (value ?? '').trim()] as const)
      .filter(([, value]) => value.length > 0),
  );
  return {
    phone: values.phone,
    source: values.source,
    ...(values.name?.trim() ? { name: values.name.trim() } : {}),
    ...(values.campaign?.trim() ? { campaign: values.campaign.trim() } : {}),
    ...(Object.keys(fields).length ? { fields } : {}),
  };
}

const validateLead = zodResolver(createLeadRequestSchema);

const resolver: Resolver<AddLeadValues> = async (values, context, options) => {
  const result = await validateLead(
    toRequest(values),
    context,
    options as Parameters<typeof validateLead>[2],
  );
  // Keep the form's own values; only the errors matter here.
  return Object.keys(result.errors).length
    ? { values: {}, errors: result.errors }
    : { values, errors: {} };
};

/**
 * Adds a lead the way a Meta lead form or the API would: the agent then sends the opening
 * message on WhatsApp and asks only what the lead hasn't answered.
 */
export function AddLeadDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus data-icon="inline-start" />
          Add lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a lead</DialogTitle>
          <DialogDescription>
            Works like a lead form submission: the agent messages this number on WhatsApp.
          </DialogDescription>
        </DialogHeader>
        {open && <AddLeadForm onDone={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function AddLeadForm({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const playbook = useQuery(playbookQueryOptions);
  const questions = playbook.data?.config.fields ?? [];
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<AddLeadValues>({ resolver, defaultValues: EMPTY });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const created = await apiSend(
        'POST',
        '/api/leads',
        toRequest(values),
        createLeadResponseSchema,
      );
      toast.success(created.isNewLead ? 'Lead added' : 'Lead updated', {
        description:
          created.ignoredFields.length > 0
            ? `Opening message queued. Ignored: ${created.ignoredFields.join(', ')}`
            : 'Opening message queued on WhatsApp.',
      });
      await queryClient.invalidateQueries({ queryKey: ['conversations'] });
      onDone();
      await navigate({ to: '/conversations', search: { lead: created.leadId } });
    } catch (error) {
      setFormError(errorMessage(error, 'Could not add the lead. Please try again.'));
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <FormAlert message={formError} />
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          id="lead-phone"
          label="WhatsApp number"
          error={errors.phone?.message}
          hint="With country code"
        >
          <Input
            id="lead-phone"
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            {...form.register('phone')}
          />
        </FormField>
        <FormField id="lead-name" label="Name" error={errors.name?.message}>
          <Input id="lead-name" placeholder="Rahul Sharma" {...form.register('name')} />
        </FormField>
        <div className="space-y-1.5">
          <Label htmlFor="lead-source">Comes from</Label>
          <Controller
            control={form.control}
            name="source"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="lead-source" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="meta_form">Meta lead form</SelectItem>
                  <SelectItem value="api">Website / API</SelectItem>
                </SelectContent>
              </Select>
            )}
          />
        </div>
        <FormField id="lead-campaign" label="Campaign (optional)" error={errors.campaign?.message}>
          <Input id="lead-campaign" placeholder="Dubai December" {...form.register('campaign')} />
        </FormField>
      </div>

      {questions.length > 0 && (
        <details className="group rounded-lg border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium select-none group-open:mb-3">
            Answers from the form (optional)
          </summary>
          <p className="mb-3 text-xs text-muted-foreground">The agent won’t ask these again.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {questions.map((question) => (
              <AnswerInput key={question.key} question={question} form={form} />
            ))}
          </div>
        </details>
      )}

      {import.meta.env.DEV && (
        <p className="text-xs text-muted-foreground">
          Development: the worker’s DEV_ALLOWED_NUMBERS setting decides who receives WhatsApp
          messages (“*” = every lead).
        </p>
      )}
      <SubmitButton pending={isSubmitting}>Add lead and send opening</SubmitButton>
    </form>
  );
}

function AnswerInput({
  question,
  form,
}: {
  question: PlaybookField;
  form: ReturnType<typeof useForm<AddLeadValues>>;
}) {
  const id = `lead-field-${question.key}`;
  const options =
    question.type === 'choice'
      ? (question.options ?? [])
      : question.type === 'yes_no'
        ? ['Yes', 'No']
        : null;
  const name = `fields.${question.key}` as const;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {question.label}
      </Label>
      {options ? (
        <Controller
          control={form.control}
          name={name}
          render={({ field }) => (
            <Select
              value={field.value ?? ''}
              onValueChange={(value) => field.onChange(value === '__none' ? '' : value)}
            >
              <SelectTrigger id={id} className="w-full">
                <SelectValue placeholder="Not given" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Not given</SelectItem>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      ) : (
        <Input id={id} placeholder="Not given" {...form.register(name)} />
      )}
    </div>
  );
}
