import type { DashboardPeriod } from '@qualify/shared';
import { useQuery, useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { LEAD_STATUSES } from '@/features/conversations/lead-statuses';
import { errorMessage } from '@/lib/api';
import { meQueryOptions } from '@/lib/session';
import { clockTime } from '@/lib/time';
import { cn } from '@/lib/utils';
import { KpiCards } from './kpi-cards';
import { LeadsChart } from './leads-chart';
import { MeterList } from './meter-list';
import { dashboardQueryOptions, SOURCE_LABELS } from './queries';
import { RecentLeads } from './recent-leads';
import { WhatsAppHealth } from './whatsapp-health';

const PERIODS: { value: DashboardPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

/** "India Standard Time" for Asia/Kolkata; the zone id when the browser has no name. */
function zoneName(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'long' })
      .formatToParts(new Date())
      .find((item) => item.type === 'timeZoneName');
    return part?.value ?? timeZone;
  } catch {
    return timeZone;
  }
}

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage({ period }: { period: DashboardPeriod }) {
  const navigate = useNavigate();
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const dashboard = useQuery(dashboardQueryOptions(period));
  const firstName = me?.user.name.split(' ')[0];
  const data = dashboard.data;
  // While another period loads, the previous numbers stay visible, slightly faded.
  const stale = dashboard.isPlaceholderData;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting(new Date().getHours())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {me?.activeWorkspace?.name ? `${me.activeWorkspace.name} · ` : ''}
            {data ? `Updated ${clockTime(data.generatedAt)}` : 'Loading your numbers…'}
          </p>
        </div>
      </div>

      {/* One filter row; it scopes every number below. */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Period"
          className="inline-flex gap-1 rounded-lg bg-muted p-1"
        >
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={period === option.value}
              onClick={() => void navigate({ to: '/', search: { period: option.value } })}
              className={cn(
                'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                period === option.value
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {period === option.value && (
                <motion.span
                  layoutId="dashboard-period"
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          ))}
        </div>
        {dashboard.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {data && (
          <span className="text-xs text-muted-foreground">Times in {zoneName(data.timezone)}</span>
        )}
      </div>

      {dashboard.isPending ? (
        <DashboardSkeleton />
      ) : dashboard.isError || !data ? (
        <p className="text-sm text-destructive">
          {errorMessage(dashboard.error, 'Could not load the dashboard. Please try again.')}
        </p>
      ) : (
        <div className={cn('space-y-6 transition-opacity', stale && 'opacity-60')}>
          <KpiCards data={data} />

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <LeadsChart data={data} />
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Where new leads stand</CardTitle>
                <CardDescription>Current status of leads created in this period</CardDescription>
              </CardHeader>
              <CardContent>
                <MeterList
                  emptyText="No new leads in this period."
                  rows={LEAD_STATUSES.map(({ status, label }) => ({
                    key: status,
                    label,
                    count: data.pipeline.find((row) => row.status === status)?.count ?? 0,
                  }))}
                />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <RecentLeads data={data} />
            </div>
            <div className="min-w-0 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Lead sources</CardTitle>
                  <CardDescription>How new leads reached you</CardDescription>
                </CardHeader>
                <CardContent>
                  <MeterList
                    emptyText="No new leads in this period."
                    rows={Object.entries(SOURCE_LABELS).map(([source, label]) => ({
                      key: source,
                      label,
                      count: data.sources.find((row) => row.source === source)?.count ?? 0,
                    }))}
                  />
                </CardContent>
              </Card>
              <WhatsAppHealth data={data} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-32" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}
