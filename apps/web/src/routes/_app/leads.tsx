import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LeadsPage } from '@/features/leads/leads-page';

const text = (max: number) => z.string().max(max).optional().catch(undefined);

export const Route = createFileRoute('/_app/leads')({
  // Filters live in the URL, so a view can be shared or bookmarked.
  validateSearch: z.object({
    from: z.iso.date().optional().catch(undefined),
    to: z.iso.date().optional().catch(undefined),
    q: text(100),
    status: text(300),
    grade: text(100),
    source: text(100),
    sort: z.enum(['newest', 'activity', 'score']).optional().catch(undefined),
    limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  }),
  component: LeadsRoute,
});

function LeadsRoute() {
  const search = Route.useSearch();
  return <LeadsPage search={search} />;
}
