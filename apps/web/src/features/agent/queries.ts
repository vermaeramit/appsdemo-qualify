import { queryOptions } from '@tanstack/react-query';
import { openingTemplateStatusSchema, playbookResponseSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

export const playbookQueryOptions = queryOptions({
  queryKey: ['playbook'] as const,
  queryFn: () => fetchJson('/api/playbook', playbookResponseSchema),
  staleTime: 30_000,
});

/** Asks Meta for the review state; re-checks every minute while a review is pending. */
export const openingTemplateQueryOptions = queryOptions({
  queryKey: ['playbook', 'opening-template'] as const,
  queryFn: () => fetchJson('/api/playbook/opening-template', openingTemplateStatusSchema),
  staleTime: 30_000,
  refetchInterval: (query) => (query.state.data?.state === 'pending' ? 60_000 : false),
});
