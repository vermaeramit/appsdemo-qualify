import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  emailReportListSchema,
  emailReportRunsSchema,
  webhookDeliveriesSchema,
  webhookListSchema,
} from '@qualify/shared';
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

/** E-mail reports; polls quickly while a run is being sent. */
export const reportsQueryOptions = queryOptions({
  queryKey: ['reports'] as const,
  queryFn: () => fetchJson('/api/reports', emailReportListSchema),
  refetchInterval: (query) =>
    query.state.data?.reports.some((report) => report.lastRun?.status === 'queued')
      ? 3_000
      : 30_000,
});

export const reportRunsQueryOptions = (reportId: string) =>
  queryOptions({
    queryKey: ['reports', reportId, 'runs'] as const,
    queryFn: () => fetchJson(`/api/reports/${reportId}/runs`, emailReportRunsSchema),
    refetchInterval: 5_000,
  });
