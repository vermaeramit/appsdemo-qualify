import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { activityHealthSchema, activityPageSchema, type ActivitySource } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

export interface ActivityFilters {
  leadId?: string | undefined;
  source?: ActivitySource | undefined;
  problems?: boolean | undefined;
}

/** Activity log pages, newest first (D-091). Live updates refresh it as entries arrive. */
export const activityQueryOptions = (filters: ActivityFilters) =>
  infiniteQueryOptions({
    queryKey: ['activity', 'list', filters] as const,
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filters.leadId) params.set('leadId', filters.leadId);
      if (filters.source) params.set('source', filters.source);
      if (filters.problems) params.set('problems', 'true');
      if (pageParam) params.set('cursor', pageParam);
      return fetchJson(`/api/activity?${params.toString()}`, activityPageSchema);
    },
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 30_000,
  });

/** Is Meta reaching us? Rechecked every 30 s (the "silent" state depends on time passing). */
export const activityHealthQueryOptions = queryOptions({
  queryKey: ['activity', 'health'] as const,
  queryFn: () => fetchJson('/api/activity/health', activityHealthSchema),
  refetchInterval: 30_000,
});
