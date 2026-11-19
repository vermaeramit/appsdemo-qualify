import { useState } from 'react';
import { ACTIVITY_SOURCE_LABELS, type ActivityEntry, type ActivitySource } from '@qualify/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  Bot,
  ChevronDown,
  CircleAlert,
  Loader2,
  MessageCircle,
  ScrollText,
  Send,
  TriangleAlert,
  UserPlus,
  Users,
  Webhook,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { clockTime, timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { type ActivityFilters, activityQueryOptions } from './queries';

const SOURCE_ICONS: Record<ActivitySource, LucideIcon> = {
  whatsapp: MessageCircle,
  agent: Bot,
  outreach: Send,
  lead: UserPlus,
  webhook: Webhook,
  team: Users,
};

/** Routine entries are shown lighter, so problems and real steps stand out. */
const QUIET_KINDS = new Set(['outreach.followup_scheduled', 'whatsapp.delivered', 'whatsapp.read']);

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function detailValue(value: string | number | boolean | null): string {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && ISO_TIME.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })} (${timeAgo(value)})`;
    }
  }
  return String(value);
}

/**
 * The activity log (D-091), newest first, grouped by day. With `showLead`, each entry links to
 * its conversation (the workspace Logs page).
 */
export function ActivityList({
  filters,
  showLead = false,
  emptyText,
}: {
  filters: ActivityFilters;
  showLead?: boolean;
  emptyText: string;
}) {
  const query = useInfiniteQuery(activityQueryOptions(filters));

  if (query.isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="text-sm text-destructive">
        {errorMessage(query.error, 'Could not load the activity. Please try again.')}
      </p>
    );
  }
  const entries = query.data.pages.flatMap((page) => page.items);
  if (!entries.length) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
        <ScrollText className="size-6" />
        {emptyText}
      </div>
    );
  }

  const days = entries.map((entry) => dayLabel(entry.at));
  return (
    <div className="space-y-1">
      <ol className="space-y-1" aria-label="Activity">
        {entries.map((entry, index) => {
          const day = days[index]!;
          const header = index === 0 || days[index - 1] !== day;
          return (
            <li key={entry.id}>
              {header && (
                <p className="px-1 pt-3 pb-1 text-xs font-medium text-muted-foreground first:pt-0">
                  {day}
                </p>
              )}
              <ActivityRow entry={entry} showLead={showLead} />
            </li>
          );
        })}
      </ol>
      {query.hasNextPage && (
        <div className="pt-2 text-center">
          <Button
            variant="outline"
            size="sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage && (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            )}
            Load older
          </Button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry, showLead }: { entry: ActivityEntry; showLead: boolean }) {
  const [open, setOpen] = useState(false);
  const details = Object.entries(entry.detail);
  const Icon =
    entry.level === 'error'
      ? CircleAlert
      : entry.level === 'warn'
        ? TriangleAlert
        : SOURCE_ICONS[entry.source];
  const quiet = entry.level === 'info' && QUIET_KINDS.has(entry.kind);
  return (
    <div
      className={cn(
        'rounded-lg border border-transparent',
        entry.level === 'error' && 'border-destructive/20 bg-destructive/5',
        entry.level === 'warn' && 'border-grade-warm/25 bg-grade-warm/5',
      )}
    >
      <button
        type="button"
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted/60 disabled:cursor-default disabled:hover:bg-transparent"
        onClick={() => setOpen((value) => !value)}
        disabled={!details.length}
        aria-expanded={details.length ? open : undefined}
      >
        <span
          className={cn(
            'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground',
            entry.level === 'error' && 'bg-destructive/15 text-destructive',
            entry.level === 'warn' && 'bg-grade-warm/15 text-grade-warm',
          )}
        >
          <Icon className="size-3.5" />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              'block text-sm break-words',
              quiet && 'text-muted-foreground',
              entry.level === 'error' && 'font-medium',
            )}
          >
            {entry.message}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            <time dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
              {clockTime(entry.at)}
            </time>
            {' · '}
            {ACTIVITY_SOURCE_LABELS[entry.source]}
          </span>
        </span>
        {details.length > 0 && (
          <ChevronDown
            className={cn(
              'mt-1 size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        )}
      </button>
      {showLead && entry.lead && (
        <div className="-mt-1 pb-2 pl-12 text-xs">
          <Link
            to="/conversations"
            search={{ lead: entry.lead.id }}
            className="text-primary hover:underline"
          >
            {entry.lead.name ?? entry.lead.phone}
          </Link>
        </div>
      )}
      {open && details.length > 0 && (
        <dl className="mx-2 mb-2 ml-12 grid gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2 text-xs sm:grid-cols-[minmax(7rem,auto)_1fr]">
          {details.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="break-words whitespace-pre-wrap">{detailValue(value)}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
