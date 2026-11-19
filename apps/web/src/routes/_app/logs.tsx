import { activitySourceSchema } from '@qualify/shared';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LogsPage } from '@/features/activity/logs-page';

export const Route = createFileRoute('/_app/logs')({
  // Filters live in the URL, so a view can be shared or bookmarked.
  validateSearch: z.object({
    source: activitySourceSchema.optional().catch(undefined),
    problems: z.boolean().optional().catch(undefined),
  }),
  component: LogsRoute,
});

function LogsRoute() {
  const search = Route.useSearch();
  return <LogsPage search={search} />;
}
