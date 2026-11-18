import { keepPreviousData, queryOptions } from '@tanstack/react-query';
import { type CostPeriod, costsResponseSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

export const costsQueryOptions = (period: CostPeriod) =>
  queryOptions({
    queryKey: ['costs', period, timeZone] as const,
    queryFn: () =>
      fetchJson(
        `/api/costs?period=${period}&tz=${encodeURIComponent(timeZone)}`,
        costsResponseSchema,
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

/** ₹0.86, $0.026, $0.0042: enough digits that small amounts don't round to zero. */
export function formatMoney(value: number, currency: string): string {
  const abs = Math.abs(value);
  const digits = abs === 0 ? 2 : abs < 0.01 ? 4 : abs < 1 && currency === 'USD' ? 3 : 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

const compact = new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 });
export const formatTokens = (value: number) => compact.format(value);

export const CATEGORY_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  utility: 'Utility',
  authentication: 'Authentication',
  authentication_international: 'Authentication (international)',
  service: 'Service (replies)',
};

export const PRICING_TYPE_LABELS: Record<string, string> = {
  regular: 'Paid',
  free_customer_service: 'Free · 24-hour window',
  free_entry_point: 'Free · ad entry point',
};

export const label = (map: Record<string, string>, key: string) =>
  map[key] ?? key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

const RATE_KEY = 'qualify.usdInrRate';

/** The viewer's USD → INR rate for showing AI costs in rupees (a per-viewer convenience). */
export function readUsdInrRate(): number | null {
  try {
    const value = Number(localStorage.getItem(RATE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveUsdInrRate(rate: number | null): void {
  try {
    if (rate) localStorage.setItem(RATE_KEY, String(rate));
    else localStorage.removeItem(RATE_KEY);
  } catch {
    // Storage blocked: the rate simply isn't remembered.
  }
}
