import { Badge } from '@/components/ui/badge';
import { KpiCards } from './kpi-cards';
import { LeadScoreCard } from './lead-score-card';
import { RecentLeads } from './recent-leads';

export function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Today&apos;s lead activity across all campaigns
          </p>
        </div>
        <Badge variant="secondary">Sample data · design preview</Badge>
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
