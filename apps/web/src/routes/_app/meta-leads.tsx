import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { MetaLeadsPage } from '@/features/meta-leads/meta-leads-page';

const day = z.iso.date().optional().catch(undefined);

export const Route = createFileRoute('/_app/meta-leads')({
  // Filters live in the URL, so a view can be shared or bookmarked.
  validateSearch: z.object({
    from: day,
    to: day,
    formId: z.string().max(64).optional().catch(undefined),
    limit: z.coerce.number().int().min(1).max(100).optional().catch(undefined),
  }),
  component: MetaLeadsRoute,
});

function MetaLeadsRoute() {
  const search = Route.useSearch();
  return <MetaLeadsPage search={search} />;
}
