import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { type DashboardPeriod, dashboardResponseSchema, LEAD_SOURCE_LABELS } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

/** The viewer's time zone decides where "today" starts. */
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const dashboardQueryOptions = (period: DashboardPeriod) =>
  queryOptions({
    queryKey: ['dashboard', period, timeZone] as const,
    queryFn: () =>
      fetchJson(
        `/api/dashboard?period=${period}&tz=${encodeURIComponent(timeZone)}`,
        dashboardResponseSchema,
      ),
    // Keep the previous numbers on screen while a new period loads (no skeleton flash).
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

export const SOURCE_LABELS: Record<string, string> = LEAD_SOURCE_LABELS;
