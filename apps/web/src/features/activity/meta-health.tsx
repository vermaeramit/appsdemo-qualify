import { type ActivityHealth, META_SILENCE_MINUTES } from '@qualify/shared';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CircleAlert, CircleCheck, TriangleAlert, Unplug } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';
import { activityHealthQueryOptions } from './queries';

function silentText(health: ActivityHealth): string {
  const sent = health.lastSentAt ? timeAgo(health.lastSentAt) : 'a while ago';
  const last = health.number?.lastEventAt
    ? ` The last event from Meta came ${timeAgo(health.number.lastEventAt)}.`
    : ' No event from Meta has arrived yet.';
  return `We sent a message ${sent}, and Meta hasn't sent any update since (Meta normally confirms every message within seconds).${last} Until this is fixed, replies from leads won't arrive here.`;
}

/** Top of the Logs page: is Meta reaching us, and how many problems in the last 24 hours. */
export function MetaConnectionCard({ onShowProblems }: { onShowProblems?: () => void }) {
  const query = useQuery(activityHealthQueryOptions);
  if (query.isPending) return <Skeleton className="h-24 w-full" />;
  if (query.isError) return null;
  const health = query.data;
  const { errors, warnings } = health.last24h;

  const state =
    health.problem === 'no_number'
      ? {
          icon: Unplug,
          tone: 'warn',
          title: 'No WhatsApp number connected',
          text: 'Connect a number to send openings and receive replies.',
        }
      : health.problem === 'silent'
        ? {
            icon: CircleAlert,
            tone: 'error',
            title: "Meta isn't reaching us",
            text: silentText(health),
          }
        : {
            icon: CircleCheck,
            tone: 'ok',
            title: 'Meta connection working',
            text: health.number?.lastEventAt
              ? `Last event from Meta ${timeAgo(health.number.lastEventAt)}${health.number.phone ? ` for ${health.number.phone}` : ''}.`
              : 'No events from Meta yet. They arrive when a lead writes or one of your messages is delivered.',
          };
  const Icon = state.icon;

  return (
    <Card
      className={cn(
        state.tone === 'error' && 'border-destructive/40 bg-destructive/5',
        state.tone === 'warn' && 'border-grade-warm/40 bg-grade-warm/5',
      )}
    >
      <CardContent className="flex flex-wrap items-start gap-3">
        <Icon
          className={cn(
            'mt-0.5 size-5 shrink-0',
            state.tone === 'ok' && 'text-success',
            state.tone === 'warn' && 'text-grade-warm',
            state.tone === 'error' && 'text-destructive',
          )}
        />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium">{state.title}</p>
          <p className="text-sm text-muted-foreground">{state.text}</p>
          {state.tone !== 'ok' && (
            <Link to="/settings" className="inline-block text-sm text-primary hover:underline">
              Open Settings → WhatsApp number
            </Link>
          )}
        </div>
        <button
          type="button"
          onClick={onShowProblems}
          disabled={!onShowProblems || errors + warnings === 0}
          className="rounded-md border bg-background px-3 py-1.5 text-left text-xs enabled:hover:bg-muted"
        >
          <span className="block text-muted-foreground">Last 24 hours</span>
          <span className={cn('font-medium', errors > 0 && 'text-destructive')}>
            {errors} {errors === 1 ? 'error' : 'errors'}
          </span>
          {' · '}
          <span className={cn('font-medium', warnings > 0 && 'text-grade-warm')}>
            {warnings} {warnings === 1 ? 'warning' : 'warnings'}
          </span>
        </button>
      </CardContent>
    </Card>
  );
}

/**
 * A short warning wherever messages are read (conversation, activity panel) while Meta isn't
 * reaching us: the reason a lead's reply "never arrived".
 */
export function MetaSilentBanner({ className }: { className?: string }) {
  const query = useQuery(activityHealthQueryOptions);
  if (query.data?.problem !== 'silent') return null;
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs',
        className,
      )}
    >
      <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
      <span>
        <span className="font-medium">Meta isn't reaching us.</span> No update from Meta for more
        than {META_SILENCE_MINUTES} minutes after our last message, so new replies may not arrive.{' '}
        <Link to="/logs" className="text-primary hover:underline">
          See logs
        </Link>
      </span>
    </div>
  );
}
