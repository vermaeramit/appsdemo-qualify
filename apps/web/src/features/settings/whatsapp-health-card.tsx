import { whatsappHealthSchema } from '@qualify/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleCheck, ExternalLink, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { fetchJson } from '@/lib/api';
import { timeAgo } from '@/lib/time';
import { cn } from '@/lib/utils';

const healthKey = ['whatsapp', 'health'] as const;

const QUALITY: Record<string, { label: string; className: string }> = {
  GREEN: { label: 'High', className: 'text-success' },
  YELLOW: { label: 'Medium', className: 'text-grade-warm' },
  RED: { label: 'Low', className: 'text-destructive' },
};

/** "TIER_2K" → "2,000 new conversations / 24 h". */
function limitLabel(tier: string | null): string {
  if (!tier) return '—';
  if (tier.includes('UNLIMITED')) return 'Unlimited';
  const match = /TIER_(\d+)(K?)/.exec(tier);
  if (!match) return tier;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  return `${value.toLocaleString()} new conversations / 24 h`;
}

const words = (value: string | null) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '—';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

/** The connected number as Meta reports it now: status, quality, limit, reviews, webhooks. */
export function WhatsAppHealthCard() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: healthKey,
    queryFn: () => fetchJson('/api/whatsapp/health', whatsappHealthSchema),
    refetchInterval: 5 * 60_000,
  });
  const refresh = async () => {
    const fresh = await fetchJson('/api/whatsapp/health?refresh=1', whatsappHealthSchema);
    queryClient.setQueryData(healthKey, fresh);
  };
  const data = query.data;
  const quality = data?.number?.qualityRating ? QUALITY[data.number.qualityRating] : undefined;

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardTitle>WhatsApp number</CardTitle>
          <CardDescription>
            Live from Meta{data ? ` · checked ${timeAgo(data.checkedAt)}` : ''}
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetching}
          onClick={() => void refresh()}
        >
          {query.isFetching ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <RefreshCw data-icon="inline-start" />
          )}
          Check again
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : query.isError || !data ? (
          <p className="text-sm text-destructive">Could not check the number.</p>
        ) : (
          <>
            {data.problems.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-success">
                <CircleCheck className="size-4" />
                Everything looks good.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {data.problems.map((problem) => (
                  <li
                    key={problem}
                    className="flex items-start gap-2 rounded-lg bg-grade-warm/10 p-2.5 text-sm"
                  >
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-grade-warm" />
                    {problem}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              {data.links.whatsappManager && (
                <Button variant="outline" size="sm" asChild>
                  <a href={data.links.whatsappManager} target="_blank" rel="noopener noreferrer">
                    WhatsApp Manager
                    <ExternalLink data-icon="inline-end" />
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <a href={data.links.billing} target="_blank" rel="noopener noreferrer">
                  Meta Billing Hub
                  <ExternalLink data-icon="inline-end" />
                </a>
              </Button>
            </div>
            {data.number && (
              <dl className="divide-y">
                <Row label="Number">
                  {data.number.displayPhone ?? '—'}
                  {data.number.verifiedName && (
                    <span className="block text-xs font-normal text-muted-foreground">
                      {data.number.verifiedName}
                    </span>
                  )}
                </Row>
                <Row label="Status">{words(data.number.status)}</Row>
                <Row label="Quality rating">
                  <span className={cn(quality?.className)}>
                    {quality?.label ?? words(data.number.qualityRating)}
                  </span>
                </Row>
                <Row label="Messaging limit">{limitLabel(data.number.messagingLimit)}</Row>
                <Row label="Display name">{words(data.number.nameStatus)}</Row>
                <Row label="Throughput">{words(data.number.throughput)}</Row>
                {data.account && (
                  <>
                    <Row label="Account review">{words(data.account.reviewStatus)}</Row>
                    <Row label="Business verification">
                      {words(data.account.businessVerification)}
                    </Row>
                  </>
                )}
                <Row label="Webhooks">
                  {data.webhooksSubscribed === null
                    ? '—'
                    : data.webhooksSubscribed
                      ? 'Subscribed'
                      : 'Not subscribed'}
                </Row>
              </dl>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
