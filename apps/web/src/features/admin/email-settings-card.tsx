import { useState } from 'react';
import { type SmtpSecurity, type SmtpSettingsView, smtpSettingsViewSchema } from '@qualify/shared';
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Send } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { apiSend, errorMessage, fetchJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';

const emailQueryOptions = queryOptions({
  queryKey: ['admin', 'email'] as const,
  queryFn: () => fetchJson('/api/admin/email', smtpSettingsViewSchema),
});

const SOURCE_TEXT: Record<
  SmtpSettingsView['source'],
  { label: string; tone: string; note: string }
> = {
  admin: {
    label: 'Sending',
    tone: 'bg-success/10 text-success',
    note: 'Scheduled reports are sent through the server below.',
  },
  env: {
    label: "Using the server's .env",
    tone: 'bg-primary/10 text-primary',
    note: 'Reports go through SMTP_URL on the server. Save a server here to replace it.',
  },
  dev: {
    label: 'Development',
    tone: 'bg-muted text-muted-foreground',
    note: 'Without a server, development e-mails go to Mailpit (http://localhost:8025).',
  },
  off: {
    label: 'Not set up',
    tone: 'bg-destructive/10 text-destructive',
    note: 'No SMTP server: scheduled reports are saved but not sent.',
  },
};

const DEFAULT_PORT: Record<SmtpSecurity, number> = { starttls: 587, ssl: 465, none: 25 };

/** The platform's SMTP server for scheduled reports (D-095). */
export function EmailSettingsCard() {
  const query = useQuery(emailQueryOptions);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="size-4" />
          Email (SMTP)
          {query.data && (
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-xs font-medium',
                SOURCE_TEXT[query.data.source].tone,
              )}
            >
              {SOURCE_TEXT[query.data.source].label}
            </span>
          )}
        </CardTitle>
        <CardDescription>
          The server every workspace's scheduled reports are sent through. Use a transactional
          e-mail provider (Brevo, ZeptoMail, Amazon SES) with your sender domain verified.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(query.error, 'Could not load the e-mail settings.')}
          </p>
        ) : (
          <EmailSettingsForm key={query.data.saved?.updatedAt ?? 'new'} view={query.data} />
        )}
      </CardContent>
    </Card>
  );
}

function EmailSettingsForm({ view }: { view: SmtpSettingsView }) {
  const queryClient = useQueryClient();
  const saved = view.saved;
  const [host, setHost] = useState(saved?.host ?? '');
  const [port, setPort] = useState(String(saved?.port ?? 587));
  const [security, setSecurity] = useState<SmtpSecurity>(saved?.security ?? 'starttls');
  const [username, setUsername] = useState(saved?.username ?? '');
  const [password, setPassword] = useState('');
  const [fromName, setFromName] = useState(saved?.fromName ?? '');
  const [fromEmail, setFromEmail] = useState(saved?.fromEmail ?? '');
  const [testTo, setTestTo] = useState(view.testRecipient);

  const portNumber = Number(port);
  const valid =
    /^[a-z0-9.-]{3,}$/i.test(host.trim()) &&
    Number.isInteger(portNumber) &&
    portNumber > 0 &&
    portNumber < 65_536 &&
    fromName.trim() !== '' &&
    z.email().safeParse(fromEmail.trim()).success &&
    (username.trim() === '' || password !== '' || Boolean(saved?.passwordSet));

  const save = useMutation({
    mutationFn: () =>
      apiSend(
        'PUT',
        '/api/admin/email',
        {
          host: host.trim(),
          port: portNumber,
          security,
          username: username.trim(),
          ...(password ? { password } : {}),
          fromName: fromName.trim(),
          fromEmail: fromEmail.trim(),
        },
        smtpSettingsViewSchema,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(emailQueryOptions.queryKey, data);
      toast.success('The SMTP server accepted the connection. Settings saved.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the settings.')),
  });
  const test = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        '/api/admin/email/test',
        { to: testTo.trim() },
        z.object({ source: z.string() }),
      ),
    onSuccess: () => toast.success(`Test e-mail sent to ${testTo.trim()}`),
    onError: (error) => toast.error(errorMessage(error, 'The test e-mail was not sent.')),
  });
  const clear = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/admin/email', {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (!response.ok) throw new Error('Could not remove the settings.');
      return smtpSettingsViewSchema.parse(await response.json());
    },
    onSuccess: (data) => {
      queryClient.setQueryData(emailQueryOptions.queryKey, data);
      toast.success("Saved server removed: the server's .env applies again");
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not remove the settings.')),
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {SOURCE_TEXT[view.source].note}
        {saved?.updatedBy && ` Saved by ${saved.updatedBy} ${timeAgo(saved.updatedAt)}.`}
      </p>
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <Field id="smtp-host" label="SMTP server" className="sm:col-span-2">
          <Input
            id="smtp-host"
            placeholder="smtp-relay.brevo.com"
            value={host}
            onChange={(event) => setHost(event.target.value)}
          />
        </Field>
        <Field id="smtp-security" label="Security">
          <Select
            value={security}
            onValueChange={(next: SmtpSecurity) => {
              // Move the port along when it still has the previous default.
              if (portNumber === DEFAULT_PORT[security]) setPort(String(DEFAULT_PORT[next]));
              setSecurity(next);
            }}
          >
            <SelectTrigger id="smtp-security" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="starttls">STARTTLS (usually port 587)</SelectItem>
              <SelectItem value="ssl">SSL/TLS (usually port 465)</SelectItem>
              <SelectItem value="none">None (only for a local relay)</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="smtp-port" label="Port">
          <Input
            id="smtp-port"
            inputMode="numeric"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </Field>
        <Field id="smtp-username" label="Username">
          <Input
            id="smtp-username"
            autoComplete="off"
            placeholder="Empty if no login"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>
        <Field id="smtp-password" label="Password">
          <Input
            id="smtp-password"
            type="password"
            autoComplete="new-password"
            placeholder={
              saved?.passwordSet ? 'Saved (leave empty to keep it)' : 'SMTP password or key'
            }
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        <Field id="smtp-from-name" label="Sender name">
          <Input
            id="smtp-from-name"
            placeholder="Qualify Reports"
            value={fromName}
            onChange={(event) => setFromName(event.target.value)}
          />
        </Field>
        <Field id="smtp-from-email" label="Sender e-mail">
          <Input
            id="smtp-from-email"
            type="email"
            placeholder="reports@your-domain.com"
            value={fromEmail}
            onChange={(event) => setFromEmail(event.target.value)}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button type="submit" size="sm" disabled={!valid || save.isPending}>
            {save.isPending && <Loader2 className="animate-spin" data-icon="inline-start" />}
            Check connection and save
          </Button>
          {saved && <RemoveButton pending={clear.isPending} onConfirm={() => clear.mutate()} />}
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-2">
          The password is stored encrypted and never shown again. Brevo: smtp-relay.brevo.com, port
          587, STARTTLS, your Brevo SMTP login and SMTP key.
        </p>
      </form>

      {view.source !== 'off' && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
          <Field id="smtp-test-to" label="Send a test e-mail to" className="min-w-56 flex-1">
            <Input
              id="smtp-test-to"
              type="email"
              value={testTo}
              onChange={(event) => setTestTo(event.target.value)}
            />
          </Field>
          <Button
            variant="outline"
            size="sm"
            disabled={test.isPending || !z.email().safeParse(testTo.trim()).success}
            onClick={() => test.mutate()}
          >
            {test.isPending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Send test e-mail
          </Button>
        </div>
      )}
    </div>
  );
}

function Field({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function RemoveButton({ pending, onConfirm }: { pending: boolean; onConfirm: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          Remove saved server
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove the saved SMTP server?</AlertDialogTitle>
          <AlertDialogDescription>
            Reports then go through SMTP_URL in the server's .env, or aren't sent if it isn't set.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Remove</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
