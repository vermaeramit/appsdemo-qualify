import { useState } from 'react';
import { type MessageTemplate, TEMPLATE_LANGUAGES, templateListSchema } from '@qualify/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { MessageSquareText, RefreshCw, Search, Trash2, TriangleAlert, Unplug } from 'lucide-react';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { apiDelete, errorMessage, fetchJson } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';
import { canManage } from '@/lib/workspace';
import { NewTemplateDialog } from './new-template-dialog';
import { TemplatePreview } from './template-preview';

const STATUS_STYLE: Record<string, string> = {
  APPROVED: 'bg-success/14 text-success',
  PENDING: 'bg-grade-warm/16 text-grade-warm',
  IN_APPEAL: 'bg-grade-warm/16 text-grade-warm',
  REJECTED: 'bg-destructive/10 text-destructive',
  PAUSED: 'bg-destructive/10 text-destructive',
  DISABLED: 'bg-muted text-muted-foreground',
};

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'PENDING', label: 'In review' },
  { value: 'REJECTED', label: 'Rejected' },
] as const;

const words = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');

/** The WhatsApp account's message templates, their review status, and new ones (M6). */
export function TemplatesPage() {
  const manager = canManage(useActiveWorkspace().role);
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['templates'],
    queryFn: () => fetchJson('/api/templates', templateListSchema),
    // Review results change status: check again every minute.
    refetchInterval: 60_000,
  });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['value']>('all');
  const [search, setSearch] = useState('');
  const templates = (query.data?.templates ?? []).filter(
    (template) =>
      (filter === 'all' ||
        template.status === filter ||
        (filter === 'PENDING' && template.status === 'IN_APPEAL')) &&
      template.name.includes(search.trim().toLowerCase()),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Templates</h1>
          <p className="text-sm text-muted-foreground">
            Approved WhatsApp templates on your number. The agent uses them to open and follow up
            outside the 24-hour window.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={query.isFetching}
          onClick={() => void queryClient.invalidateQueries({ queryKey: ['templates'] })}
        >
          <RefreshCw className={cn(query.isFetching && 'animate-spin')} data-icon="inline-start" />
          Refresh
        </Button>
        {manager && query.data?.connected && <NewTemplateDialog />}
      </div>

      {query.isPending ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-48" />
          ))}
        </div>
      ) : query.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(query.error, 'Could not load templates from Meta.')}
        </p>
      ) : !query.data.connected ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <Unplug className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">{query.data.reason}</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Templates live on your WhatsApp account. Connect a number in Settings first.
            </p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/settings">Open Settings</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div
              className="inline-flex gap-1 rounded-lg bg-muted p-1"
              role="group"
              aria-label="Status"
            >
              {FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                    filter === item.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-60">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search templates"
                placeholder="Search by name"
                className="h-8 pl-8"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </div>
          {templates.length === 0 ? (
            <Card>
              <CardContent className="grid place-items-center gap-2 py-12 text-center">
                <MessageSquareText className="size-8 text-muted-foreground" />
                <p className="text-sm font-medium">No templates here</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((template) => (
                <TemplateCard
                  key={`${template.name}:${template.language}`}
                  template={template}
                  canDelete={manager}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TemplateCard({ template, canDelete }: { template: MessageTemplate; canDelete: boolean }) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => apiDelete(`/api/templates/${encodeURIComponent(template.name)}`),
    onSuccess: async () => {
      toast.success(`Deleted “${template.name}”`);
      await queryClient.invalidateQueries({ queryKey: ['templates'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the template.')),
  });
  const language =
    TEMPLATE_LANGUAGES[template.language as keyof typeof TEMPLATE_LANGUAGES] ?? template.language;

  return (
    <Card className="gap-3 py-4">
      <CardContent className="space-y-3 px-4">
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium" title={template.name}>
              {template.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {language} · {words(template.category)}
              {template.qualityScore && ` · quality ${template.qualityScore.toLowerCase()}`}
            </p>
          </div>
          <Badge
            variant="outline"
            className={cn('border-transparent', STATUS_STYLE[template.status] ?? 'bg-muted')}
          >
            {words(template.status === 'PENDING' ? 'IN_REVIEW' : template.status)}
          </Badge>
        </div>
        {template.usedFor.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {template.usedFor.map((use) => (
              <span
                key={use}
                className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
              >
                AI agent {use === 'opening' ? 'opening' : 'follow-up'}
              </span>
            ))}
          </div>
        )}
        {template.rejectedReason && (
          <p className="flex items-start gap-1.5 text-xs text-destructive">
            <TriangleAlert className="mt-px size-3.5 shrink-0" />
            Rejected: {words(template.rejectedReason)}
          </p>
        )}
        <div className="rounded-xl bg-muted/50 p-3">
          {template.headerFormat && template.headerFormat !== 'TEXT' && (
            <p className="mb-1 text-xs text-muted-foreground">
              [{words(template.headerFormat)} header]
            </p>
          )}
          <TemplatePreview
            headerText={template.headerText}
            bodyText={template.bodyText}
            footerText={template.footerText}
            buttons={template.buttons.map((button) => button.text)}
          />
        </div>
        {canDelete && template.usedFor.length === 0 && (
          <div className="flex justify-end">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="xs" className="text-destructive">
                  <Trash2 data-icon="inline-start" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete “{template.name}”?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Meta deletes it in every language. The same name can&apos;t be used again for 30
                    days.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => remove.mutate()}>Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
