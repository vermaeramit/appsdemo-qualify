import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { leadListResponseSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';
import { viewerTimeZone } from '@/lib/date-range';

/** Filters as they live in the URL (lists are comma-separated). */
export interface LeadsSearch {
  from?: string | undefined;
  to?: string | undefined;
  q?: string | undefined;
  status?: string | undefined;
  grade?: string | undefined;
  source?: string | undefined;
  sort?: 'newest' | 'activity' | 'score' | undefined;
  limit?: number | undefined;
}

/** Query string for the list and the export (without paging). */
export function leadFilterParams(search: LeadsSearch): URLSearchParams {
  const params = new URLSearchParams({ tz: viewerTimeZone });
  for (const key of ['from', 'to', 'q', 'status', 'grade', 'source', 'sort'] as const) {
    const value = search[key];
    if (value) params.set(key, value);
  }
  return params;
}

export const leadsQueryOptions = (search: LeadsSearch, cursor: string | undefined) =>
  queryOptions({
    queryKey: ['leads', search, cursor ?? null, viewerTimeZone] as const,
    queryFn: () => {
      const params = leadFilterParams(search);
      params.set('limit', String(search.limit ?? 25));
      if (cursor) params.set('cursor', cursor);
      return fetchJson(`/api/leads?${params.toString()}`, leadListResponseSchema);
    },
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });
