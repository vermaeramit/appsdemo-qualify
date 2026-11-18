import type { ReactNode } from 'react';
import { type OpeningTemplateStatus, openingTemplateStatusSchema } from '@qualify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Clock,
  Loader2,
  RefreshCw,
  Send,
  TriangleAlert,
  Unplug,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { Skeleton } from '@/components/ui/skeleton';
import { apiSend, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { openingTemplateQueryOptions, playbookQueryOptions } from './queries';

const STATE_VIEW: Record<
  OpeningTemplateStatus['state'],
  { label: string; icon: typeof Clock; className: string; text: string }
> = {
  not_connected: {
    label: 'Not connected',
    icon: Unplug,
    className: 'text-muted-foreground',
    text: 'Connect a WhatsApp number to submit the template.',
  },
  not_submitted: {
    label: 'Not submitted',
    icon: CircleDashed,
    className: 'text-muted-foreground',
    text: 'Needed to message form and API leads who haven’t written to you in the last 24 hours.',
  },
  pending: {
    label: 'In review',
    icon: Clock,
    className: 'text-grade-cold',
    text: 'Meta is reviewing it. This usually takes minutes, sometimes a few hours.',
  },
  approved: {
    label: 'Approved',
    icon: CircleCheck,
    className: 'text-success',
    text: 'Approved by Meta. Use it to contact leads outside the 24-hour window.',
  },
  rejected: {
    label: 'Rejected',
    icon: CircleX,
    className: 'text-destructive',
    text: 'Change the opening text, publish, and submit again.',
  },
  paused: {
    label: 'Paused by Meta',
    icon: TriangleAlert,
    className: 'text-grade-warm',
    text: 'Meta paused it because of low quality ratings.',
  },
  disabled: {
    label: 'Disabled by Meta',
    icon: TriangleAlert,
    className: 'text-destructive',
    text: 'Change the opening text, publish, and submit a new template.',
  },
};

/** Meta review state of the opening template, with submit / activate actions. */
export function OpeningTemplateCard({ readOnly, dirty }: { readOnly: boolean; dirty: boolean }) {
  const queryClient = useQueryClient();
  const status = useQuery(openingTemplateQueryOptions);

  const onStatus = (data: OpeningTemplateStatus) =>
    queryClient.setQueryData(openingTemplateQueryOptions.queryKey, data);

  const submit = useMutation({
    mutationFn: () =>
      apiSend('POST', '/api/playbook/opening-template', undefined, openingTemplateStatusSchema),
    onSuccess: (data) => {
      onStatus(data);
      toast.success('Submitted to Meta for review');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not submit the template.')),
  });

  const activate = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        '/api/playbook/opening-template/activate',
        undefined,
        openingTemplateStatusSchema,
      ),
    onSuccess: async (data) => {
      onStatus(data);
      toast.success('The approved template is now used for openings');
      await queryClient.invalidateQueries({ queryKey: playbookQueryOptions.queryKey });
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not activate the template.')),
  });

  let body: ReactNode;
  if (status.isPending) {
    body = <Skeleton className="h-16 w-full" />;
  } else if (status.isError) {
    body = (
      <p className="text-sm text-destructive">
        {errorMessage(status.error, 'Could not check the template status.')}
      </p>
    );
  } else {
    const data = status.data;
    const view = STATE_VIEW[data.state];
    const Icon = view.icon;
    const active = data.state === 'approved' && data.active;
    const blocked = dirty ? 'Publish your changes first.' : null;

    body = (
      <div className="space-y-3">
        <div className={cn('flex items-center gap-2 text-sm font-medium', view.className)}>
          <Icon className="size-4" />
          {active ? 'Active' : view.label}
        </div>
        <p className="text-xs text-muted-foreground">
          {active
            ? 'Leads outside the 24-hour window receive this approved template.'
            : (data.message ?? view.text)}
        </p>
        {data.rejectedReason && (
          <p className="text-xs">
            Reason: <span className="font-medium">{data.rejectedReason}</span>
          </p>
        )}
        <p className="truncate font-mono text-[0.7rem] text-muted-foreground" title={data.name}>
          {data.name} · {data.language}
        </p>

        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {data.state === 'not_submitted' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" disabled={Boolean(blocked) || submit.isPending}>
                    {submit.isPending ? (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    ) : (
                      <Send data-icon="inline-start" />
                    )}
                    Submit to Meta
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Submit the opening for review?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The published opening text and buttons are sent to Meta as a Marketing
                      template on your WhatsApp account. Once approved, it is used for leads outside
                      the 24-hour window.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => submit.mutate()}>Submit</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {data.state === 'approved' && !data.active && (
              <Button
                size="sm"
                disabled={Boolean(blocked) || activate.isPending}
                onClick={() => activate.mutate()}
              >
                {activate.isPending && (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                )}
                Use this template
              </Button>
            )}
            {data.state !== 'not_connected' && !active && (
              <Button
                size="sm"
                variant="outline"
                disabled={status.isFetching}
                onClick={() => void status.refetch()}
              >
                <RefreshCw
                  className={cn(status.isFetching && 'animate-spin')}
                  data-icon="inline-start"
                />
                Check again
              </Button>
            )}
          </div>
        )}
        {blocked && !readOnly && !active && data.state !== 'not_connected' && (
          <p className="text-xs text-grade-warm">{blocked}</p>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">WhatsApp template</CardTitle>
        <CardDescription>Meta’s approval for the opening text.</CardDescription>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}
