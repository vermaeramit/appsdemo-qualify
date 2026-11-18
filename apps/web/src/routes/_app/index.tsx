import { dashboardPeriodSchema } from '@qualify/shared';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { DashboardPage } from '@/features/dashboard/dashboard-page';

export const Route = createFileRoute('/_app/')({
  // The period lives in the URL (?period=7d), so a view can be shared or bookmarked.
  validateSearch: z.object({ period: dashboardPeriodSchema.optional().catch(undefined) }),
  component: DashboardRoute,
});

function DashboardRoute() {
  const { period } = Route.useSearch();
  return <DashboardPage period={period ?? 'today'} />;
}
