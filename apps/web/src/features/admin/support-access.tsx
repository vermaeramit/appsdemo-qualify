import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  openSupportAccessSchema,
  SUPPORT_ACCESS_MINUTES,
  type SupportSession,
  supportHistorySchema,
} from '@qualify/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Eye, History } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormField } from '@/components/form/form-field';
import { SubmitButton } from '@/components/form/submit-button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { apiSend, errorMessage, fetchJson } from '@/lib/api';
import { afterWorkspaceSwitch } from '@/lib/session';
import { clockTime, timeAgo } from '@/lib/time';

const openedSchema = z.object({ workspaceId: z.string(), expiresAt: z.iso.datetime() });
const reasonSchema = openSupportAccessSchema.pick({ reason: true });

const supportHistoryQueryKey = ['admin', 'support'] as const;

/** Opens a client's workspace read-only, with a reason (D-092). */
export function OpenSupportDialog({ workspace }: { workspace: { id: string; name: string } }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const form = useForm({ resolver: zodResolver(reasonSchema), defaultValues: { reason: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ reason }) => {
    try {
      await apiSend(
        'POST',
        '/api/admin/support',
        { workspaceId: workspace.id, reason },
        openedSchema,
      );
      await afterWorkspaceSwitch(queryClient);
      await navigate({ to: '/' });
    } catch (error) {
      toast.error(errorMessage(error, `Could not open ${workspace.name}.`));
    }
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset({ reason: '' });
      }}
    >
      <DialogTrigger asChild>
        <Button size="xs" variant="outline">
          <Eye data-icon="inline-start" />
          Open read-only
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>Open {workspace.name} read-only</DialogTitle>
            <DialogDescription>
              You see what its owner sees, but you can't change anything. Access ends after{' '}
              {SUPPORT_ACCESS_MINUTES} minutes. The workspace's team sees this visit and your reason
              in its Logs.
            </DialogDescription>
          </DialogHeader>
          <FormField
            id="support-reason"
            label="Reason"
            error={errors.reason?.message}
            hint="For example: the client asked why a lead got no reply."
          >
            <Textarea
              id="support-reason"
              rows={3}
              aria-invalid={Boolean(errors.reason)}
              {...form.register('reason')}
            />
          </FormField>
          <SubmitButton pending={isSubmitting}>Open read-only</SubmitButton>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function minutesBetween(from: string, to: string): number {
  return Math.max(1, Math.round((Date.parse(to) - Date.parse(from)) / 60_000));
}

function StateBadge({ item }: { item: SupportSession }) {
  if (item.state === 'active') {
    return <Badge>Active until {clockTime(item.expiresAt)}</Badge>;
  }
  if (item.state === 'ended' && item.endedAt) {
    return (
      <Badge variant="secondary">
        Ended after {minutesBetween(item.startedAt, item.endedAt)} min
      </Badge>
    );
  }
  return <Badge variant="outline">Expired</Badge>;
}

/** Every support visit to a client workspace, newest first: the audit trail (D-092). */
export function SupportHistoryCard() {
  const query = useQuery({
    queryKey: supportHistoryQueryKey,
    queryFn: () => fetchJson('/api/admin/support', supportHistorySchema),
    refetchInterval: 30_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support access</CardTitle>
        <CardDescription>
          Every read-only visit to a client workspace, newest first. The workspace sees the same
          visits in its Logs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {query.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : query.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(query.error, 'Could not load the support history.')}
          </p>
        ) : query.data.items.length === 0 ? (
          <div className="grid place-items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <History className="size-6" />
            No support visits yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Workspace</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Conversations opened</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">
                      <div>
                        {new Date(item.startedAt).toLocaleString([], {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </div>
                      <div className="text-xs text-muted-foreground">{timeAgo(item.startedAt)}</div>
                    </TableCell>
                    <TableCell className="font-medium">{item.workspace.name}</TableCell>
                    <TableCell>
                      <div>{item.admin.name}</div>
                      <div className="text-xs text-muted-foreground">{item.admin.email}</div>
                    </TableCell>
                    <TableCell className="max-w-xs min-w-56 text-sm break-words whitespace-normal">
                      {item.reason}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <StateBadge item={item} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.conversationsViewed}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
