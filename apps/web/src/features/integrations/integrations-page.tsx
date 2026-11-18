import { useState } from 'react';
import {
  type CreateWebhook,
  WEBHOOK_EVENT_LABELS,
  type WebhookDelivery,
  type WebhookEndpoint,
  webhookEndpointSchema,
  type WebhookEventType,
  type WebhookWithSecret,
  webhookWithSecretSchema,
} from '@qualify/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  FileSpreadsheet,
  KeyRound,
  Loader2,
  Plus,
  RotateCw,
  Send,
  Trash2,
  Webhook,
} from 'lucide-react';
import { z } from 'zod';
import { toast } from 'sonner';
import { CopyButton } from '@/components/copy-button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { apiDelete, apiSend, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';
import { cn } from '@/lib/utils';
import { deliveriesQueryOptions, webhooksQueryOptions } from './queries';
import { GRADE_OPTIONS } from './grades';
import { WebhookForm } from './webhook-form';

const VERIFY_SNIPPET = `import crypto from 'node:crypto';

// rawBody: the request body exactly as received (before JSON.parse)
function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const age = Math.abs(Date.now() / 1000 - Number(parts.t));
  if (age > 300) return false; // older than 5 minutes
  const expected = crypto
    .createHmac('sha256', secret)
    .update(\`\${parts.t}.\${rawBody}\`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

// verify(rawBody, req.headers['x-qualify-signature'], process.env.QUALIFY_WEBHOOK_SECRET)`;

const okSchema = z.object({ deliveryId: z.uuid() });

/** Where results go: webhooks to any system, and the Excel export. Owners and managers. */
export function IntegrationsPage() {
  const workspace = useActiveWorkspace();
  if (!canManage(workspace.role)) {
    return (
      <div className="space-y-5">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Only owners and managers can manage integrations.
          </CardContent>
        </Card>
      </div>
    );
  }
  return <ManagerIntegrations />;
}

function ManagerIntegrations() {
  const query = useQuery(webhooksQueryOptions);
  const [adding, setAdding] = useState(false);
  const [secret, setSecret] = useState<WebhookWithSecret | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
          <p className="text-sm text-muted-foreground">
            Send qualified leads to your CRM, a sheet, or any system that accepts a webhook.
          </p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          Add webhook
        </Button>
      </div>

      {query.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(query.error, 'Could not load webhooks.')}
        </p>
      ) : query.data.endpoints.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <Webhook className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No webhooks yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              Add a URL and we POST each lead (answers, score, summary, source) to it when it is
              qualified, handed off, or whichever events you pick. Every request is signed.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>
              <Plus data-icon="inline-start" />
              Add webhook
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {query.data.endpoints.map((endpoint) => (
            <EndpointCard key={endpoint.id} endpoint={endpoint} onSecret={setSecret} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="size-4" />
              Verify the signature
            </CardTitle>
            <CardDescription>
              Each request has <code className="font-mono text-xs">X-Qualify-Signature</code>:
              <code className="font-mono text-xs"> t=…,v1=…</code>, an HMAC-SHA256 of
              <code className="font-mono text-xs"> {'"<t>.<raw body>"'}</code> with your secret. The
              event id (<code className="font-mono text-xs">id</code>) stays the same on retries, so
              you can ignore duplicates. Reply with any 2xx within 10 seconds; other answers are
              retried for about 2 hours.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative rounded-lg border bg-muted/50">
              <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">
                {VERIFY_SNIPPET}
              </pre>
              <CopyButton
                text={VERIFY_SNIPPET}
                label="Copy code"
                variant="ghost"
                className="absolute top-1.5 right-1.5 size-7"
              />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="size-4" />
              Excel
            </CardTitle>
            <CardDescription>
              Download leads with their answers, score and summary as an Excel file, with the same
              filters you use on the Leads page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" asChild>
              <Link to="/leads">Open Leads</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <AddWebhookDialog
        open={adding}
        onOpenChange={setAdding}
        onCreated={(created) => {
          setAdding(false);
          setSecret(created);
        }}
      />
      <SecretDialog value={secret} onClose={() => setSecret(null)} />
    </div>
  );
}

function AddWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (value: WebhookWithSecret) => void;
}) {
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (value: CreateWebhook) =>
      apiSend('POST', '/api/webhooks', value, webhookWithSecretSchema),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['webhooks'] });
      onCreated(created);
    },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) create.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add webhook</DialogTitle>
          <DialogDescription>We POST JSON to this URL for the events you pick.</DialogDescription>
        </DialogHeader>
        {open && (
          <WebhookForm
            submitLabel="Add webhook"
            pending={create.isPending}
            error={create.isError ? errorMessage(create.error, 'Could not add the webhook.') : null}
            onSubmit={(value) => create.mutate(value)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SecretDialog({
  value,
  onClose,
}: {
  value: WebhookWithSecret | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={value !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Signing secret</DialogTitle>
          <DialogDescription>
            Copy it now and keep it on your server. It is shown only once; you can rotate it later.
          </DialogDescription>
        </DialogHeader>
        {value && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/50 p-2">
            <code
              className="min-w-0 flex-1 truncate font-mono text-sm"
              data-testid="webhook-secret"
            >
              {value.secret}
            </code>
            <CopyButton text={value.secret} label="Copy secret" />
          </div>
        )}
        <div className="flex justify-end">
          <Button onClick={onClose}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EndpointCard({
  endpoint,
  onSecret,
}: {
  endpoint: WebhookEndpoint;
  onSecret: (value: WebhookWithSecret) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['webhooks'] });

  const update = useMutation({
    mutationFn: (value: Partial<CreateWebhook> & { active?: boolean }) =>
      apiSend('PATCH', `/api/webhooks/${endpoint.id}`, value, webhookEndpointSchema),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the webhook.')),
  });
  const test = useMutation({
    mutationFn: () => apiSend('POST', `/api/webhooks/${endpoint.id}/test`, undefined, okSchema),
    onSuccess: async () => {
      toast.success('Test event queued. Its result appears in the deliveries below.');
      setShowLog(true);
      await queryClient.invalidateQueries({ queryKey: ['webhooks', endpoint.id] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send a test event.')),
  });
  const rotate = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        `/api/webhooks/${endpoint.id}/rotate-secret`,
        undefined,
        webhookWithSecretSchema,
      ),
    onSuccess: async (value) => {
      await refresh();
      onSecret(value);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not rotate the secret.')),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/webhooks/${endpoint.id}`),
    onSuccess: async () => {
      toast.success('Webhook deleted');
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the webhook.')),
  });

  const gradeText = endpoint.grades.length
    ? endpoint.grades
        .map((grade) => GRADE_OPTIONS.find((option) => option.value === grade)?.label ?? grade)
        .join(', ')
    : 'All grades';

  return (
    <Card className={cn(!endpoint.active && 'opacity-75')}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">
              {endpoint.description ?? 'Webhook'}
            </CardTitle>
            <p className="truncate font-mono text-xs text-muted-foreground" title={endpoint.url}>
              {endpoint.url}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={endpoint.active}
              disabled={update.isPending}
              onCheckedChange={(active) => update.mutate({ active })}
              aria-label="Webhook on"
            />
            {endpoint.active ? 'On' : 'Off'}
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {endpoint.events.map((type) => (
            <span key={type} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {WEBHOOK_EVENT_LABELS[type as WebhookEventType]}
            </span>
          ))}
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
            {gradeText}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Secret {endpoint.secretHint}…
          {endpoint.lastSuccessAt && ` · Last delivered ${timeAgo(endpoint.lastSuccessAt)}`}
          {endpoint.lastFailureAt && ` · Last failure ${timeAgo(endpoint.lastFailureAt)}`}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={test.isPending || !endpoint.active}
            onClick={() => test.mutate()}
          >
            {test.isPending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Send test event
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowLog((value) => !value)}>
            {showLog ? 'Hide deliveries' : 'Deliveries'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Confirm
            title="Rotate the signing secret?"
            description="Requests are signed with the new secret right away. Update your server first, or deliveries will fail verification."
            action="Rotate secret"
            onConfirm={() => rotate.mutate()}
          >
            <Button size="sm" variant="outline" disabled={rotate.isPending}>
              <KeyRound data-icon="inline-start" />
              Rotate secret
            </Button>
          </Confirm>
          <Confirm
            title="Delete this webhook?"
            description="No more events are sent to this URL, and its delivery log is deleted."
            action="Delete"
            onConfirm={() => remove.mutate()}
          >
            <Button size="sm" variant="ghost" className="text-destructive">
              <Trash2 data-icon="inline-start" />
              Delete
            </Button>
          </Confirm>
        </div>
        {showLog && <DeliveryLog endpointId={endpoint.id} />}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit webhook</DialogTitle>
            <DialogDescription>Changes apply to the next events.</DialogDescription>
          </DialogHeader>
          {editing && (
            <WebhookForm
              initial={endpoint}
              submitLabel="Save"
              pending={update.isPending}
              error={null}
              onSubmit={(value) => update.mutate(value)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Confirm({
  title,
  description,
  action,
  onConfirm,
  children,
}: {
  title: string;
  description: string;
  action: string;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeliveryLog({ endpointId }: { endpointId: string }) {
  const query = useInfiniteQuery(deliveriesQueryOptions(endpointId));
  if (query.isPending) return <Skeleton className="h-24 w-full" />;
  if (query.isError) {
    return <p className="text-sm text-destructive">Could not load deliveries.</p>;
  }
  const deliveries = query.data.pages.flatMap((page) => page.deliveries);
  if (deliveries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
        No deliveries yet. Send a test event to try the endpoint.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <ul className="divide-y rounded-lg border">
        {deliveries.map((delivery) => (
          <DeliveryRow key={delivery.id} delivery={delivery} endpointId={endpointId} />
        ))}
      </ul>
      {query.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more
        </Button>
      )}
    </div>
  );
}

function DeliveryRow({ delivery, endpointId }: { delivery: WebhookDelivery; endpointId: string }) {
  const queryClient = useQueryClient();
  const resend = useMutation({
    mutationFn: () =>
      fetch(`/api/webhooks/deliveries/${delivery.id}/resend`, {
        method: 'POST',
        credentials: 'same-origin',
      }).then((response) => {
        if (!response.ok) throw new Error('Could not resend');
      }),
    onSuccess: async () => {
      toast.success('Queued again');
      await queryClient.invalidateQueries({ queryKey: ['webhooks', endpointId, 'deliveries'] });
    },
    onError: () => toast.error('Could not resend this delivery.'),
  });
  const Icon =
    delivery.status === 'succeeded'
      ? CircleCheck
      : delivery.status === 'failed'
        ? CircleAlert
        : Clock;
  const label =
    delivery.eventType === 'webhook.test'
      ? 'Test event'
      : (WEBHOOK_EVENT_LABELS[delivery.eventType as WebhookEventType] ?? delivery.eventType);
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3 text-sm">
      <Icon
        className={cn(
          'size-4 shrink-0',
          delivery.status === 'succeeded'
            ? 'text-success'
            : delivery.status === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground',
        )}
        aria-label={delivery.status}
      />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {label}
          {delivery.leadName && (
            <span className="font-normal text-muted-foreground"> · {delivery.leadName}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {timeAgo(delivery.createdAt)} · {delivery.attempts}{' '}
          {delivery.attempts === 1 ? 'attempt' : 'attempts'}
          {delivery.responseStatus !== null && ` · HTTP ${delivery.responseStatus}`}
          {delivery.status === 'pending' && delivery.nextAttemptAt && ' · retrying'}
          {delivery.error && delivery.status !== 'succeeded' && ` · ${delivery.error}`}
        </div>
      </div>
      {delivery.status !== 'pending' && (
        <Button
          variant="ghost"
          size="xs"
          disabled={resend.isPending}
          onClick={() => resend.mutate()}
        >
          <RotateCw data-icon="inline-start" />
          Resend
        </Button>
      )}
    </li>
  );
}
