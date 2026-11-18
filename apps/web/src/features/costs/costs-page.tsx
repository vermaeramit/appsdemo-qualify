import { type ReactNode, useState } from 'react';
import type { CostPeriod, CostsResponse } from '@qualify/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Bot, Calculator, Coins, Loader2, MessageCircle, Unplug } from 'lucide-react';
import { motion } from 'motion/react';
import { bucketLabel } from '@/components/charts/chart-scales';
import { ColumnChart } from '@/components/charts/column-chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  costsQueryOptions,
  formatMoney,
  formatTokens,
  label,
  PRICING_TYPE_LABELS,
  readUsdRate,
  saveUsdRate,
} from './format';

const PERIODS: { value: CostPeriod; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
];

function Tile({
  label: title,
  icon: Icon,
  accent,
  value,
  hint,
  index,
}: {
  label: string;
  icon: typeof Bot;
  accent: string;
  value: ReactNode;
  hint: ReactNode;
  index: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
    >
      <Card className="h-full">
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground sm:text-sm">{title}</span>
            <span className={`grid size-7 shrink-0 place-items-center rounded-md ${accent}`}>
              <Icon className="size-4" />
            </span>
          </div>
          <div className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
          <p className="text-xs text-muted-foreground">{hint}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export function CostsPage({ period }: { period: CostPeriod }) {
  const navigate = useNavigate();
  const costs = useQuery(costsQueryOptions(period));
  // AI is billed in USD; Meta in the WhatsApp account's currency. Show both in the latter.
  const currency = costs.data?.meta.currency ?? 'INR';
  const [rateTexts, setRateTexts] = useState<Record<string, string>>({});
  const rateText = rateTexts[currency] ?? String(readUsdRate(currency) ?? '');
  const parsedRate = Number(rateText);
  const rate = currency === 'USD' ? 1 : rateText.trim() && parsedRate > 0 ? parsedRate : null;

  const onRateChange = (text: string) => {
    setRateTexts((current) => ({ ...current, [currency]: text }));
    const value = Number(text);
    saveUsdRate(currency, text.trim() && Number.isFinite(value) && value > 0 ? value : null);
  };

  const forbidden = costs.error instanceof ApiError && costs.error.status === 403;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Costs</h1>
        <p className="text-sm text-muted-foreground">
          What WhatsApp (Meta) and the AI agent cost this workspace.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div
          role="radiogroup"
          aria-label="Period"
          className="inline-flex gap-1 rounded-lg bg-muted p-1"
        >
          {PERIODS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={period === option.value}
              onClick={() => void navigate({ to: '/costs', search: { period: option.value } })}
              className={cn(
                'relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                period === option.value
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {period === option.value && (
                <motion.span
                  layoutId="costs-period"
                  className="absolute inset-0 rounded-md bg-background shadow-sm"
                  transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
                />
              )}
              <span className="relative">{option.label}</span>
            </button>
          ))}
        </div>
        {currency !== 'USD' && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            1 USD =
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="rate"
              value={rateText}
              onChange={(event) => onRateChange(event.target.value)}
              className="h-8 w-24"
              aria-label={`US dollar to ${currency} rate, for AI costs`}
            />
            {currency}
          </label>
        )}
        {costs.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {costs.isPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-32" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      ) : forbidden ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Only owners and managers can see costs.
          </CardContent>
        </Card>
      ) : costs.isError || !costs.data ? (
        <p className="text-sm text-destructive">
          {errorMessage(costs.error, 'Could not load costs. Please try again.')}
        </p>
      ) : (
        <div
          className={cn('space-y-6 transition-opacity', costs.isPlaceholderData && 'opacity-60')}
        >
          <CostTiles data={costs.data} rate={rate} currency={currency} />
          <div className="grid gap-4 lg:grid-cols-2">
            <MetaChart data={costs.data} />
            <AiChart data={costs.data} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <MetaBreakdown data={costs.data} />
            <AiBreakdown data={costs.data} rate={rate} currency={currency} />
          </div>
          <PaidMessages data={costs.data} />
        </div>
      )}
    </div>
  );
}

function CostTiles({
  data,
  rate,
  currency,
}: {
  data: CostsResponse;
  rate: number | null;
  currency: string;
}) {
  const { meta, ai, leads } = data;
  const metaCurrency = currency;
  const metaReady = meta.status === 'ok';
  const aiInr = rate ? ai.totalUsd * rate : null;
  // No connected number means no WhatsApp charges; a Meta error means the amount is unknown.
  const metaInr = meta.status === 'not_connected' ? 0 : metaReady ? meta.totalCost : null;
  const total = aiInr !== null && metaInr !== null ? aiInr + metaInr : null;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      <Tile
        index={0}
        label="WhatsApp (Meta)"
        icon={MessageCircle}
        accent="text-success bg-success/10"
        value={
          metaReady ? (
            formatMoney(meta.totalCost, metaCurrency)
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        hint={
          metaReady
            ? `${meta.billableMessages} paid · ${meta.freeMessages} free messages`
            : meta.status === 'not_connected'
              ? 'No WhatsApp number connected'
              : 'Meta did not answer'
        }
      />
      <Tile
        index={1}
        label="AI agent"
        icon={Bot}
        accent="text-primary bg-primary/10"
        value={formatMoney(ai.totalUsd, 'USD')}
        hint={
          <>
            {ai.replies} {ai.replies === 1 ? 'reply' : 'replies'}
            {aiInr !== null && currency !== 'USD' && <> · ≈ {formatMoney(aiInr, currency)}</>}
          </>
        }
      />
      <Tile
        index={2}
        label="Cost per new lead"
        icon={Calculator}
        accent="text-grade-cold bg-grade-cold/10"
        value={
          leads.newLeads === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : total !== null ? (
            formatMoney(total / leads.newLeads, currency)
          ) : (
            <span className="text-xl">
              {metaReady && formatMoney(meta.totalCost / leads.newLeads, metaCurrency)}
              {metaReady && ' + '}
              {formatMoney(ai.totalUsd / leads.newLeads, 'USD')}
            </span>
          )
        }
        hint={
          leads.newLeads === 0
            ? 'No new leads in this period'
            : `${leads.newLeads} new ${leads.newLeads === 1 ? 'lead' : 'leads'} · ${leads.qualified} qualified`
        }
      />
      <Tile
        index={3}
        label="Total"
        icon={Coins}
        accent="text-grade-warm bg-grade-warm/10"
        value={
          total !== null ? (
            formatMoney(total, currency)
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        hint={
          total !== null
            ? `Meta ${formatMoney(metaInr ?? 0, currency)} + AI ${formatMoney(aiInr ?? 0, currency)}`
            : !rate
              ? `Enter 1 USD = … ${currency} above to add the AI cost`
              : 'Meta numbers are not available'
        }
      />
    </div>
  );
}

function MetaChart({ data }: { data: CostsResponse }) {
  const currency = data.meta.currency ?? 'INR';
  const volume = new Map(data.meta.daily.map((day) => [day.day, day.volume]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp cost per day</CardTitle>
        <CardDescription>As billed by Meta ({currency}), before taxes</CardDescription>
      </CardHeader>
      <CardContent>
        {data.meta.status !== 'ok' ? (
          <MetaUnavailable data={data} />
        ) : (
          <ColumnChart
            points={data.meta.daily.map((day) => ({ bucket: day.day, value: day.cost }))}
            formatValue={(value) => formatMoney(value, currency)}
            tooltip={(point) => (
              <>
                {formatMoney(point.value, currency)}
                <span className="font-normal opacity-80">
                  {' '}
                  · {volume.get(point.bucket) ?? 0} messages
                </span>
              </>
            )}
            ariaLabel={(point) =>
              `${bucketLabel(point.bucket)}: ${formatMoney(point.value, currency)}, ${volume.get(point.bucket) ?? 0} messages`
            }
            table={{ caption: 'WhatsApp cost per day', valueHeader: `Cost (${currency})` }}
          />
        )}
      </CardContent>
    </Card>
  );
}

function AiChart({ data }: { data: CostsResponse }) {
  const replies = new Map(data.ai.daily.map((day) => [day.day, day.replies]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI cost per day</CardTitle>
        <CardDescription>Estimated in USD from token usage</CardDescription>
      </CardHeader>
      <CardContent>
        <ColumnChart
          points={data.ai.daily.map((day) => ({ bucket: day.day, value: day.costUsd }))}
          formatValue={(value) => formatMoney(value, 'USD')}
          tooltip={(point) => (
            <>
              {formatMoney(point.value, 'USD')}
              <span className="font-normal opacity-80">
                {' '}
                · {replies.get(point.bucket) ?? 0} replies
              </span>
            </>
          )}
          ariaLabel={(point) =>
            `${bucketLabel(point.bucket)}: ${formatMoney(point.value, 'USD')}, ${replies.get(point.bucket) ?? 0} replies`
          }
          table={{ caption: 'AI cost per day', valueHeader: 'Cost (USD)' }}
        />
      </CardContent>
    </Card>
  );
}

function MetaUnavailable({ data }: { data: CostsResponse }) {
  return (
    <div className="flex items-start gap-2 py-6 text-sm text-muted-foreground">
      <Unplug className="mt-0.5 size-4 shrink-0" />
      {data.meta.message ?? 'Meta numbers are not available.'}
    </div>
  );
}

function MetaBreakdown({ data }: { data: CostsResponse }) {
  const { meta } = data;
  const currency = meta.currency ?? 'INR';
  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp messages by category</CardTitle>
        <CardDescription>
          Meta charges per delivered template; replies inside the 24-hour window are free.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {meta.status !== 'ok' ? (
          <div className="px-6">
            <MetaUnavailable data={data} />
          </div>
        ) : meta.breakdown.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">No messages in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Category</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Messages</TableHead>
                <TableHead className="pr-6 text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {meta.breakdown.map((row) => (
                <TableRow key={`${row.category}:${row.pricingType}`}>
                  <TableCell className="pl-6">{label(CATEGORY_LABELS, row.category)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {label(PRICING_TYPE_LABELS, row.pricingType)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.volume}</TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">
                    {formatMoney(row.cost, currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="pl-6" colSpan={2}>
                  Total
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {meta.billableMessages + meta.freeMessages}
                </TableCell>
                <TableCell className="pr-6 text-right tabular-nums">
                  {formatMoney(meta.totalCost, currency)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
        <p className="px-6 pt-3 text-xs text-muted-foreground">
          Source: Meta’s pricing analytics for your WhatsApp account, before taxes. Meta updates it
          with some delay.
        </p>
      </CardContent>
    </Card>
  );
}

function AiBreakdown({
  data,
  rate,
  currency,
}: {
  data: CostsResponse;
  rate: number | null;
  currency: string;
}) {
  const { ai } = data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>AI usage by model</CardTitle>
        <CardDescription>
          {ai.inputTokens > 0
            ? `${Math.round((ai.cachedInputTokens / ai.inputTokens) * 100)}% of input tokens came from the prompt cache (10× cheaper).`
            : 'Token usage of the AI agent’s replies.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {ai.byModel.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">No AI replies in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Model</TableHead>
                <TableHead className="text-right">Replies</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Input</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Output</TableHead>
                <TableHead className="pr-6 text-right">Cost</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ai.byModel.map((row) => (
                <TableRow key={row.model}>
                  <TableCell className="pl-6 font-mono text-xs">{row.model}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.replies}</TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatTokens(row.inputTokens)}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {formatTokens(row.outputTokens)}
                  </TableCell>
                  <TableCell className="pr-6 text-right tabular-nums">
                    {row.costUsd === null ? (
                      <span className="text-muted-foreground">No price</span>
                    ) : (
                      <>
                        {formatMoney(row.costUsd, 'USD')}
                        {rate && currency !== 'USD' && (
                          <span className="block text-xs text-muted-foreground">
                            ≈ {formatMoney(row.costUsd * rate, currency)}
                          </span>
                        )}
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="px-6 pt-3 text-xs text-muted-foreground">
          Estimated from each reply’s token usage × OpenAI list prices (checked {ai.pricesAsOf}).
          {ai.unpricedReplies > 0 &&
            ` ${ai.unpricedReplies} replies use a model without a known price and are not included.`}{' '}
          Evals run from the terminal are not included.
        </p>
      </CardContent>
    </Card>
  );
}

function PaidMessages({ data }: { data: CostsResponse }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Paid WhatsApp messages</CardTitle>
        <CardDescription>
          Messages Meta marked as billable, from delivery updates. Most recent first.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        {data.billable.length === 0 ? (
          <p className="px-6 py-4 text-sm text-muted-foreground">
            No paid messages in this period.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-6">Lead</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="hidden md:table-cell">Template</TableHead>
                <TableHead className="pr-6 text-right">Sent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.billable.map((row) => (
                <TableRow key={row.messageId}>
                  <TableCell className="pl-6">
                    <Link
                      to="/conversations"
                      search={{ lead: row.leadId }}
                      className="font-medium hover:underline"
                    >
                      {row.leadName ?? row.phone}
                    </Link>
                    {row.leadName && (
                      <span className="block text-xs text-muted-foreground">{row.phone}</span>
                    )}
                  </TableCell>
                  <TableCell>{label(CATEGORY_LABELS, row.category)}</TableCell>
                  <TableCell className="hidden font-mono text-xs md:table-cell">
                    {row.templateName ?? '—'}
                  </TableCell>
                  <TableCell className="pr-6 text-right text-xs text-muted-foreground">
                    {new Date(row.sentAt).toLocaleString([], {
                      day: 'numeric',
                      month: 'short',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
