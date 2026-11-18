import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  type ApiKeySummary,
  apiKeyListSchema,
  type CreatedApiKey,
  createApiKeyRequestSchema,
  createdApiKeySchema,
} from '@qualify/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, KeyRound, Plus, TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { apiPost, apiSend, errorMessage, fetchJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';

const apiKeysQueryOptions = queryOptions({
  queryKey: ['api-keys'] as const,
  queryFn: () => fetchJson('/api/api-keys', apiKeyListSchema),
});

/** Copies text and shows a tick for a moment. */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('Could not copy. Select the text and copy it manually.');
        }
      }}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
    </Button>
  );
}

/** Workspace API keys for the public API (lead intake, agent configuration). */
export function ApiKeysCard() {
  const keys = useQuery(apiKeysQueryOptions);
  const active = keys.data?.keys.filter((key) => !key.revokedAt) ?? [];
  const revoked = keys.data?.keys.filter((key) => key.revokedAt) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>API keys</CardTitle>
        <CardDescription>
          For your website, CRM or Postman. Send it as{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            Authorization: Bearer &lt;key&gt;
          </code>
          .
        </CardDescription>
        <CardAction>
          <CreateKeyDialog />
        </CardAction>
      </CardHeader>
      <CardContent>
        {keys.isPending ? (
          <div className="space-y-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        ) : keys.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(keys.error, 'Could not load the API keys.')}
          </p>
        ) : keys.data.keys.length === 0 ? (
          <div className="grid place-items-center gap-2 py-8 text-center">
            <KeyRound className="size-7 text-muted-foreground" />
            <p className="text-sm font-medium">No API keys yet</p>
            <p className="text-xs text-muted-foreground">Create one to send leads from Postman.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Key</TableHead>
                <TableHead className="hidden sm:table-cell">Created</TableHead>
                <TableHead className="hidden sm:table-cell">Last used</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...active, ...revoked].map((key) => (
                <KeyRow key={key.id} apiKey={key} />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function KeyRow({ apiKey }: { apiKey: ApiKeySummary }) {
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => apiPost(`/api/api-keys/${apiKey.id}/revoke`),
    onSuccess: async () => {
      toast.success(`Revoked "${apiKey.name}"`);
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryOptions.queryKey });
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not revoke the key.')),
  });
  const isRevoked = Boolean(apiKey.revokedAt);

  return (
    <TableRow className={isRevoked ? 'opacity-55' : undefined}>
      <TableCell className="font-medium">{apiKey.name}</TableCell>
      <TableCell className="font-mono text-xs">{apiKey.prefix}…</TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {timeAgo(apiKey.createdAt)}
      </TableCell>
      <TableCell className="hidden text-muted-foreground sm:table-cell">
        {apiKey.lastUsedAt ? timeAgo(apiKey.lastUsedAt) : 'Never'}
      </TableCell>
      <TableCell className="text-right">
        {isRevoked ? (
          <Badge variant="secondary">Revoked</Badge>
        ) : (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="text-destructive">
                Revoke
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Revoke “{apiKey.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  Requests with this key stop working immediately. This can’t be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive" onClick={() => revoke.mutate()}>
                  Revoke key
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </TableCell>
    </TableRow>
  );
}

function CreateKeyDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const form = useForm({
    resolver: zodResolver(createApiKeyRequestSchema),
    defaultValues: { name: 'Postman' },
  });
  const { errors, isSubmitting } = form.formState;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      // Forget the secret as soon as the dialog closes.
      setCreated(null);
      form.reset({ name: 'Postman' });
    }
  };

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const key = await apiSend('POST', '/api/api-keys', values, createdApiKeySchema);
      setCreated(key);
      await queryClient.invalidateQueries({ queryKey: apiKeysQueryOptions.queryKey });
    } catch (error) {
      toast.error(errorMessage(error, 'Could not create the key.'));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus data-icon="inline-start" />
          New key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Copy your API key</DialogTitle>
              <DialogDescription>
                “{created.name}” is ready. Store it somewhere safe.
              </DialogDescription>
            </DialogHeader>
            <div className="flex gap-2">
              <Input
                readOnly
                value={created.key}
                className="font-mono text-xs"
                aria-label="API key"
                onFocus={(event) => event.target.select()}
              />
              <CopyButton text={created.key} label="Copy API key" />
            </div>
            <p className="flex items-start gap-2 rounded-lg border border-grade-warm/40 bg-grade-warm/8 p-3 text-xs">
              <TriangleAlert className="size-4 shrink-0 text-grade-warm" />
              It is shown only once. If you lose it, revoke it and create a new one.
            </p>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <DialogHeader>
              <DialogTitle>New API key</DialogTitle>
              <DialogDescription>Name it after where you’ll use it.</DialogDescription>
            </DialogHeader>
            <FormField id="key-name" label="Name" error={errors.name?.message}>
              <Input id="key-name" aria-invalid={Boolean(errors.name)} {...form.register('name')} />
            </FormField>
            <SubmitButton pending={isSubmitting}>Create key</SubmitButton>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
