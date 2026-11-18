import { useState } from 'react';
import type { MetaLeadItem } from '@qualify/shared';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Braces, ChevronLeft, ChevronRight, FileInput, Loader2, TriangleAlert } from 'lucide-react';
import { motion } from 'motion/react';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { lastDays, metaLeadsQueryOptions } from './queries';

export interface MetaLeadsSearch {
  from?: string | undefined;
  to?: string | undefined;
  formId?: string | undefined;
  limit?: number | undefined;
}

const PRESETS = [
  { label: 'Today', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
];

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Every Meta lead form submission, exactly as received, with date filters and paging. */
export function MetaLeadsPage({ search }: { search: MetaLeadsSearch }) {
  const navigate = useNavigate();
  const limit = search.limit ?? 25;
  // Cursors of the pages before the current one (for "Previous").
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const cursor = cursors.at(-1);
  const query = useQuery(
    metaLeadsQueryOptions({
      from: search.from,
      to: search.to,
      formId: search.formId,
      limit,
      cursor,
    }),
  );
  const data = query.data;

  const setSearch = (next: Partial<MetaLeadsSearch>) => {
    setCursors([undefined]);
    void navigate({ to: '/meta-leads', search: { ...search, ...next } });
  };
  const activePreset = data
    ? PRESETS.find((preset) => {
        const range = lastDays(preset.days);
        return range.from === data.from && range.to === data.to;
      })
    : undefined;
  const page = cursors.length;
  const start = (page - 1) * limit + 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meta leads</h1>
        <p className="text-sm text-muted-foreground">
          Every lead form submission from Meta, exactly as it arrived: any form, any field.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Period">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => setSearch(lastDays(preset.days))}
              aria-pressed={activePreset?.days === preset.days}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                activePreset?.days === preset.days
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Input
            type="date"
            aria-label="From date"
            className="h-8 w-40"
            value={data?.from ?? search.from ?? ''}
            max={data?.to ?? search.to}
            onChange={(event) => event.target.value && setSearch({ from: event.target.value })}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="h-8 w-40"
            value={data?.to ?? search.to ?? ''}
            min={data?.from ?? search.from}
            onChange={(event) => event.target.value && setSearch({ to: event.target.value })}
          />
        </div>
        <Select
          value={search.formId ?? '__all'}
          onValueChange={(value) => setSearch({ formId: value === '__all' ? undefined : value })}
        >
          <SelectTrigger className="h-8 w-56" aria-label="Form">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All forms</SelectItem>
            {data?.forms.map((form) => (
              <SelectItem key={form.formId} value={form.formId}>
                {form.formName ?? `Form ${form.formId}`} ({form.count})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {query.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : query.isError || !data ? (
        <p className="text-sm text-destructive">
          {errorMessage(query.error, 'Could not load Meta leads. Please try again.')}
        </p>
      ) : data.items.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <FileInput className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No Meta leads in this period</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Submissions from your connected Facebook Page’s lead forms appear here within seconds.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn('space-y-3 transition-opacity', query.isPlaceholderData && 'opacity-60')}
        >
          <p className="text-xs text-muted-foreground">
            {start}–{start + data.items.length - 1} of {data.total} submissions
          </p>
          <ul className="space-y-2">
            {data.items.map((item, index) => (
              <SubmissionCard key={item.id} item={item} index={index} />
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Rows per page
              <Select
                value={String(limit)}
                onValueChange={(value) => setSearch({ limit: Number(value) })}
              >
                <SelectTrigger className="h-8 w-20" aria-label="Rows per page">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...new Set([25, 50, 100, limit])]
                    .sort((a, b) => a - b)
                    .map((size) => (
                      <SelectItem key={size} value={String(size)}>
                        {size}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Page {page}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={page === 1 || query.isFetching}
                onClick={() => setCursors((current) => current.slice(0, -1))}
              >
                <ChevronLeft data-icon="inline-start" />
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!data.nextCursor || query.isFetching}
                onClick={() => {
                  const next = data.nextCursor;
                  if (next) setCursors((current) => [...current, next]);
                }}
              >
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubmissionCard({ item, index }: { item: MetaLeadItem; index: number }) {
  const [raw, setRaw] = useState(false);
  const json = JSON.stringify(
    {
      leadgen_id: item.leadgenId,
      form_id: item.formId,
      ad_id: item.adId,
      field_data: item.rawFieldData,
    },
    null,
    2,
  );
  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.02 }}
      className="rounded-xl border bg-card p-4 shadow-xs"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <div className="min-w-0 flex-1">
          {item.lead ? (
            <Link
              to="/conversations"
              search={{ lead: item.lead.id }}
              className="font-medium hover:underline"
            >
              {item.lead.name ?? item.lead.phone}
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-grade-warm">
              <TriangleAlert className="size-4" />
              No valid phone: no lead created
            </span>
          )}
          <p className="text-xs text-muted-foreground">
            {item.lead?.name ? `${item.lead.phone} · ` : ''}
            {item.formName ?? `Form ${item.formId}`}
            {item.pageName ? ` · ${item.pageName}` : ''}
          </p>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          <div>{dateTime(item.receivedAt)}</div>
          {item.adId && <div className="font-mono">ad {item.adId}</div>}
        </div>
      </div>

      {raw ? (
        <div className="relative mt-3 rounded-lg border bg-muted/50">
          <pre className="overflow-x-auto p-3 pr-12 font-mono text-xs leading-relaxed">{json}</pre>
          <CopyButton
            text={json}
            label="Copy raw submission"
            variant="ghost"
            className="absolute top-1.5 right-1.5 size-7"
          />
        </div>
      ) : (
        <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {item.fields.map((field) => (
            <div key={field.name} className="min-w-0">
              <dt
                className="truncate font-mono text-[0.7rem] text-muted-foreground"
                title={field.name}
              >
                {field.name}
              </dt>
              <dd className="text-sm break-words">{field.values.join(', ') || '—'}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="xs" onClick={() => setRaw((value) => !value)}>
          <Braces data-icon="inline-start" />
          {raw ? 'Show fields' : 'Raw JSON'}
        </Button>
      </div>
    </motion.li>
  );
}
