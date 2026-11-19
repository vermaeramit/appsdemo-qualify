import { useState } from 'react';
import {
  type AgentSummary,
  type CreateEmailReport,
  type EmailReport,
  type EmailReportRun,
  emailReportRunSchema,
  emailReportSchema,
  WEEKDAY_LABELS,
} from '@qualify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Loader2,
  Mail,
  MailMinus,
  Plus,
  Send,
  Trash2,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { agentsQueryOptions } from '@/features/agent/queries';
import { apiDelete, apiSend, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { GRADE_OPTIONS } from './grades';
import { reportRunsQueryOptions, reportsQueryOptions } from './queries';
import { ReportForm } from './report-form';

/** "Daily at 09:00", "Weekly on Monday at 09:00", "Monthly on the 1st at 09:00". */
function scheduleText(report: Pick<EmailReport, 'frequency' | 'weekday' | 'sendTime'>) {
  if (report.frequency === 'weekly') {
    return `Weekly on ${WEEKDAY_LABELS[report.weekday - 1] ?? 'Monday'} at ${report.sendTime}`;
  }
  if (report.frequency === 'monthly') return `Monthly on the 1st at ${report.sendTime}`;
  return `Daily at ${report.sendTime}`;
}

const dayText = (day: string) =>
  new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${day}T00:00:00Z`),
  );
const periodText = (run: EmailReportRun) =>
  run.periodFrom === run.periodTo
    ? dayText(run.periodFrom)
    : `${dayText(run.periodFrom)} – ${dayText(run.periodTo)}`;

function nextText(report: EmailReport): string {
  if (!report.enabled) return 'Paused';
  if (!report.nextRunAt) return 'Not scheduled';
  const when = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: report.timeZone,
  }).format(new Date(report.nextRunAt));
  return `Next: ${when}`;
}

function RunStatus({ run }: { run: EmailReportRun }) {
  const leads =
    run.leadCount === null ? '' : `${run.leadCount} lead${run.leadCount === 1 ? '' : 's'}`;
  if (run.status === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <CircleCheck className="size-3.5" />
        Sent{leads && ` · ${leads}`}
      </span>
    );
  }
  if (run.status === 'skipped') {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <MailMinus className="size-3.5" />
        Skipped (no new leads)
      </span>
    );
  }
  if (run.status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-destructive" title={run.error ?? ''}>
        <CircleAlert className="size-3.5" />
        Failed{run.error ? `: ${run.error}` : ''}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Loader2 className="size-3.5 animate-spin" />
      Sending…
    </span>
  );
}

/** Scheduled e-mail reports on the Integrations page (FR-8.2, D-088). Owners and managers. */
export function EmailReportsSection() {
  const query = useQuery(reportsQueryOptions);
  const agents = useQuery(agentsQueryOptions);
  const [adding, setAdding] = useState(false);
  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (value: CreateEmailReport) =>
      apiSend('POST', '/api/reports', value, emailReportSchema),
    onSuccess: async (report) => {
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      setAdding(false);
      toast.success(`“${report.name}” saved`, { description: nextText(report) });
    },
  });
  const agentList = agents.data?.agents ?? [];

  return (
    <section className="space-y-4" aria-labelledby="email-reports-heading">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="email-reports-heading" className="flex items-center gap-2 text-lg font-semibold">
            <Mail className="size-5" />
            Email reports
          </h2>
          <p className="text-sm text-muted-foreground">
            A summary of new leads, with every lead attached as Excel, e-mailed on a schedule.
          </p>
        </div>
        <Button variant="outline" onClick={() => setAdding(true)}>
          <Plus data-icon="inline-start" />
          New report
        </Button>
      </div>

      {query.data && !query.data.emailConfigured && (
        <p className="flex items-start gap-2 rounded-lg border border-grade-warm/40 bg-grade-warm/8 p-3 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-grade-warm" />
          E-mail sending isn't set up on this server yet, so reports are saved but not sent. Ask
          your administrator to configure SMTP.
        </p>
      )}

      {query.isPending ? (
        <Skeleton className="h-36 w-full" />
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(query.error, 'Could not load the reports.')}
        </p>
      ) : query.data.reports.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-10 text-center">
            <Mail className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No email reports yet</p>
            <p className="max-w-md text-xs text-muted-foreground">
              For example: every morning at 9, yesterday's leads with their grade, score and
              summary, to the sales team.
            </p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setAdding(true)}>
              <Plus data-icon="inline-start" />
              New report
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {query.data.reports.map((report) => (
            <ReportCard
              key={report.id}
              report={report}
              agents={agentList}
              canSend={query.data.emailConfigured}
            />
          ))}
        </div>
      )}

      <Dialog
        open={adding}
        onOpenChange={(next) => {
          if (!next) create.reset();
          setAdding(next);
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New email report</DialogTitle>
            <DialogDescription>
              Who gets it, when, and which leads it covers. Times follow the time zone you pick.
            </DialogDescription>
          </DialogHeader>
          {adding && (
            <ReportForm
              agents={agentList}
              submitLabel="Save report"
              pending={create.isPending}
              error={
                create.isError ? errorMessage(create.error, 'Could not save the report.') : null
              }
              onSubmit={(value) => create.mutate(value)}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReportCard({
  report,
  agents,
  canSend,
}: {
  report: EmailReport;
  agents: AgentSummary[];
  canSend: boolean;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showRuns, setShowRuns] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['reports'] });

  const update = useMutation({
    mutationFn: (value: Partial<CreateEmailReport>) =>
      apiSend('PATCH', `/api/reports/${report.id}`, value, emailReportSchema),
    onSuccess: async () => {
      await refresh();
      setEditing(false);
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not update the report.')),
  });
  const send = useMutation({
    mutationFn: () =>
      apiSend('POST', `/api/reports/${report.id}/send`, undefined, emailReportRunSchema),
    onSuccess: async () => {
      toast.success('Sending the report', {
        description: 'It covers the current period so far and arrives within a minute.',
      });
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not send the report.')),
  });
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/reports/${report.id}`),
    onSuccess: async () => {
      toast.success('Report deleted');
      await refresh();
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the report.')),
  });

  const agent = report.agentId ? agents.find((item) => item.id === report.agentId) : undefined;
  const scope = [
    report.grades.length
      ? report.grades
          .map((grade) => GRADE_OPTIONS.find((option) => option.value === grade)?.label ?? grade)
          .join(', ')
      : 'All grades',
    agent ? agent.name : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card className={cn(!report.enabled && 'opacity-75')}>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-base">{report.name}</CardTitle>
            <p className="text-xs text-muted-foreground">
              {scheduleText(report)} · {report.timeZone.replace(/_/g, ' ')}
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={report.enabled}
              disabled={update.isPending}
              onCheckedChange={(enabled) => update.mutate({ enabled })}
              aria-label="Report on"
            />
            {report.enabled ? 'On' : 'Off'}
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs">
          {report.recipients.map((email) => (
            <span key={email} className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">
              {email}
            </span>
          ))}
          <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{scope}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {nextText(report)}
          </span>
          {report.lastRun && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <RunStatus run={report.lastRun} />
              <span>· {timeAgo(report.lastRun.createdAt)}</span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={send.isPending || !canSend}
            onClick={() => send.mutate()}
          >
            {send.isPending ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Send data-icon="inline-start" />
            )}
            Send now
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowRuns((value) => !value)}>
            {showRuns ? 'Hide history' : 'History'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="ghost" className="text-destructive">
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete “{report.name}”?</AlertDialogTitle>
                <AlertDialogDescription>
                  No more e-mails are sent for it, and its history is deleted.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {showRuns && <RunHistory reportId={report.id} />}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit email report</DialogTitle>
            <DialogDescription>Changes apply from the next e-mail.</DialogDescription>
          </DialogHeader>
          {editing && (
            <ReportForm
              initial={report}
              agents={agents}
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

function RunHistory({ reportId }: { reportId: string }) {
  const query = useQuery(reportRunsQueryOptions(reportId));
  if (query.isPending) return <Skeleton className="h-20 w-full" />;
  if (query.isError) {
    return <p className="text-sm text-destructive">Could not load the history.</p>;
  }
  if (!query.data.runs.length) {
    return <p className="text-sm text-muted-foreground">Nothing sent yet.</p>;
  }
  return (
    <ul className="divide-y rounded-lg border text-sm" aria-label="Report history">
      {query.data.runs.map((run) => (
        <li key={run.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
          <span className="w-28 shrink-0 font-medium">{periodText(run)}</span>
          <span className="min-w-0 flex-1 truncate text-xs">
            <RunStatus run={run} />
          </span>
          <span className="text-xs text-muted-foreground">
            {run.trigger === 'manual' ? 'Sent by hand · ' : ''}
            {timeAgo(run.sentAt ?? run.createdAt)}
          </span>
        </li>
      ))}
    </ul>
  );
}
