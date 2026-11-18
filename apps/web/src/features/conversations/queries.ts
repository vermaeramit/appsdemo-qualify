import { infiniteQueryOptions } from '@tanstack/react-query';
import { conversationListSchema, conversationThreadSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

// Live updates (Server-Sent Events, D-079) refetch on every change; polling is the fallback.
// Both are keyset-paginated: a refetch reloads the loaded pages in order, so they stay contiguous.

export const conversationsQueryOptions = infiniteQueryOptions({
  queryKey: ['conversations', 'list'] as const,
  queryFn: ({ pageParam }) =>
    fetchJson(
      `/api/conversations${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
      conversationListSchema,
    ),
  initialPageParam: '',
  getNextPageParam: (page) => page.nextCursor ?? undefined,
  refetchInterval: 20_000,
});

/** Page 0 is the latest messages; each next page is older. */
export const threadQueryOptions = (leadId: string) =>
  infiniteQueryOptions({
    queryKey: ['conversations', leadId] as const,
    queryFn: ({ pageParam }) =>
      fetchJson(
        `/api/conversations/${leadId}${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ''}`,
        conversationThreadSchema,
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.olderCursor ?? undefined,
    refetchInterval: 15_000,
  });
