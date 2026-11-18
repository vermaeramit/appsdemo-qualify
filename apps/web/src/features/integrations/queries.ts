import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { webhookDeliveriesSchema, webhookListSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

export const webhooksQueryOptions = queryOptions({
  queryKey: ['webhooks'] as const,
  queryFn: () => fetchJson('/api/webhooks', webhookListSchema),
  refetchInterval: 15_000,
});

export const deliveriesQueryOptions = (endpointId: string) =>
  infiniteQueryOptions({
    queryKey: ['webhooks', endpointId, 'deliveries'] as const,
    queryFn: ({ pageParam }) =>
      fetchJson(
        `/api/webhooks/${endpointId}/deliveries${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ''}`,
        webhookDeliveriesSchema,
      ),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    refetchInterval: 5_000,
  });
