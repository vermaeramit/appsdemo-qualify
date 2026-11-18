import { queryOptions } from '@tanstack/react-query';
import { openingTemplateStatusSchema, playbookResponseSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

export const playbookQueryOptions = queryOptions({
  queryKey: ['playbook'] as const,
  queryFn: () => fetchJson('/api/playbook', playbookResponseSchema),
  staleTime: 30_000,
});

/** Asks Meta for the review state; re-checks every minute while a review is pending. */
export const templateQueryOptions = (kind: 'opening' | 'followup') =>
  queryOptions({
    queryKey: ['playbook', 'template', kind] as const,
    queryFn: () => fetchJson(`/api/playbook/templates/${kind}`, openingTemplateStatusSchema),
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? 60_000 : false),
  });

export const openingTemplateQueryOptions = templateQueryOptions('opening');
