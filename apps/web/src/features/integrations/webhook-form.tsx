import { useState } from 'react';
import {
  type CreateWebhook,
  WEBHOOK_EVENT_LABELS,
  type WebhookEndpoint,
  type WebhookEventType,
  webhookEventTypeSchema,
} from '@qualify/shared';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { GRADE_OPTIONS } from './grades';

const DEFAULT_EVENTS: WebhookEventType[] = ['lead.qualified', 'lead.handoff'];

export function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        on
          ? 'border-primary bg-primary/10 text-primary'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** URL, events and grade filter of a webhook (add and edit). */
export function WebhookForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: WebhookEndpoint;
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (value: CreateWebhook) => void;
}) {
  const [url, setUrl] = useState(initial?.url ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [events, setEvents] = useState<WebhookEventType[]>(initial?.events ?? DEFAULT_EVENTS);
  const [grades, setGrades] = useState<CreateWebhook['grades']>(initial?.grades ?? []);
  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({ url: url.trim(), description: description.trim() || undefined, events, grades });
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="webhook-url">Endpoint URL</Label>
        <Input
          id="webhook-url"
          type="url"
          required
          placeholder="https://your-crm.example.com/qualify-webhook"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="webhook-description">Name (optional)</Label>
        <Input
          id="webhook-description"
          maxLength={100}
          placeholder="e.g. CRM, Google Sheet via Zapier"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Send when</legend>
        <div className="flex flex-wrap gap-1.5">
          {webhookEventTypeSchema.options.map((type) => (
            <Chip
              key={type}
              on={events.includes(type)}
              onClick={() => setEvents((current) => toggle(current, type))}
            >
              {WEBHOOK_EVENT_LABELS[type]}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Only these grades</legend>
        <p className="text-xs text-muted-foreground">Leave all off to send every lead.</p>
        <div className="flex flex-wrap gap-1.5">
          {GRADE_OPTIONS.map((grade) => (
            <Chip
              key={grade.value}
              on={grades.includes(grade.value)}
              onClick={() => setGrades((current) => toggle(current, grade.value))}
            >
              {grade.label}
            </Chip>
          ))}
        </div>
      </fieldset>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || events.length === 0}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
