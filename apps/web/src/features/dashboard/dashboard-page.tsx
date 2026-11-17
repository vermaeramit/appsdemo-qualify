import { useSuspenseQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { meQueryOptions } from '@/lib/session';
import { KpiCards } from './kpi-cards';
import { LeadScoreCard } from './lead-score-card';
import { RecentLeads } from './recent-leads';

function greeting(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function DashboardPage() {
  const { data: me } = useSuspenseQuery(meQueryOptions);
  const firstName = me?.user.name.split(' ')[0];
  const workspaceName = me?.activeWorkspace?.name;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting(new Date().getHours())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
          <p className="text-sm text-muted-foreground">
            {workspaceName ? `${workspaceName} · ` : ''}Today&apos;s lead activity across all
            campaigns
          </p>
        </div>
        <Badge variant="secondary">Sample data · real leads arrive in M4</Badge>
      </div>

      <KpiCards />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentLeads />
        </div>
        <LeadScoreCard />
      </div>
    </div>
  );
}
