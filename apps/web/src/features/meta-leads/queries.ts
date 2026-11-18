import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { metaLeadsResponseSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export interface MetaLeadsParams {
  from?: string | undefined;
  to?: string | undefined;
  formId?: string | undefined;
  limit: number;
  cursor?: string | undefined;
}

export const metaLeadsQueryOptions = (params: MetaLeadsParams) =>
  queryOptions({
    queryKey: ['meta-leads', params, timeZone] as const,
    queryFn: () => {
      const search = new URLSearchParams({ tz: timeZone, limit: String(params.limit) });
      if (params.from) search.set('from', params.from);
      if (params.to) search.set('to', params.to);
      if (params.formId) search.set('formId', params.formId);
      if (params.cursor) search.set('cursor', params.cursor);
      return fetchJson(`/api/meta-leads?${search.toString()}`, metaLeadsResponseSchema);
    },
    // The previous page stays on screen while the next one loads.
    placeholderData: keepPreviousData,
    refetchInterval: 30_000,
  });

/** Today and N-1 days back as YYYY-MM-DD, in the viewer's time zone. */
export function lastDays(days: number): { from: string; to: string } {
  const format = (date: Date) =>
    new Intl.DateTimeFormat('en-CA', { timeZone, dateStyle: 'short' }).format(date);
  const now = new Date();
  return { from: format(new Date(now.getTime() - (days - 1) * 86_400_000)), to: format(now) };
}
