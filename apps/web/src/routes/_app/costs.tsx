import { costPeriodSchema } from '@qualify/shared';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { CostsPage } from '@/features/costs/costs-page';

export const Route = createFileRoute('/_app/costs')({
  validateSearch: z.object({ period: costPeriodSchema.optional().catch(undefined) }),
  component: CostsRoute,
});

function CostsRoute() {
  const { period } = Route.useSearch();
  return <CostsPage period={period ?? 'month'} />;
}
