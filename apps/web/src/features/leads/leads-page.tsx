import { useRef, useState } from 'react';
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type LeadGrade,
  type LeadListItem,
} from '@qualify/shared';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Search,
  Users,
} from 'lucide-react';
import { GradeBadge } from '@/components/leads/grade-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LeadStatusBadge } from '@/features/conversations/lead-status';
import { AddLeadDialog } from '@/features/leads/add-lead-dialog';
import { errorMessage } from '@/lib/api';
import { activePreset, lastDays, PERIOD_PRESETS } from '@/lib/date-range';
import { timeAgo } from '@/lib/time';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';
import { canManage } from '@/lib/workspace';
import { leadFilterParams, type LeadsSearch, leadsQueryOptions } from './queries';

const GRADES: { value: LeadGrade | 'none'; label: string }[] = [
  { value: 'hot', label: 'Hot' },
  { value: 'warm', label: 'Warm' },
  { value: 'cold', label: 'Cold' },
  { value: 'disqualified', label: 'Not a fit' },
  { value: 'none', label: 'Not scored' },
];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'score', label: 'Highest score' },
  { value: 'activity', label: 'Latest activity' },
] as const;

const list = (value: string | undefined) => (value ? value.split(',').filter(Boolean) : []);
const toggle = (values: string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
const joined = (values: string[]) => (values.length ? values.join(',') : undefined);

const shortDate = (iso: string) =>
  new Date(iso).toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

/** Every lead with filters, sorting, server-side paging and an Excel export. */
export function LeadsPage({ search }: { search: LeadsSearch }) {
  const navigate = useNavigate();
  const workspace = useActiveWorkspace();
  const manager = canManage(workspace.role);
  const limit = search.limit ?? 25;
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const query = useQuery(leadsQueryOptions(search, cursors.at(-1)));
  const data = query.data;

  const [text, setText] = useState(search.q ?? '');
  const typing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setSearch = (next: Partial<LeadsSearch>) => {
    setCursors([undefined]);
    void navigate({ to: '/leads', search: { ...search, ...next } });
  };
  const onType = (value: string) => {
    setText(value);
    clearTimeout(typing.current);
    typing.current = setTimeout(() => setSearch({ q: value.trim() || undefined }), 350);
  };

  const statuses = list(search.status);
  const grades = list(search.grade);
  const sources = list(search.source);
  const preset = activePreset(data);
  const page = cursors.length;
  const start = (page - 1) * limit + 1;
  const exportUrl = `/api/leads/export?${leadFilterParams({ ...search, from: data?.from ?? search.from, to: data?.to ?? search.to }).toString()}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            Every lead from every source, with its score and progress.
          </p>
        </div>
        {manager && (
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href={exportUrl} download>
                <Download data-icon="inline-start" />
                Export Excel
              </a>
            </Button>
            <AddLeadDialog />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search leads"
            placeholder="Search name or phone"
            className="h-8 pl-8"
            value={text}
            onChange={(event) => onType(event.target.value)}
          />
        </div>
        <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="group" aria-label="Period">
          {PERIOD_PRESETS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setSearch(lastDays(item.days))}
              aria-pressed={preset?.days === item.days}
              className={cn(
                'rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
                preset?.days === item.days
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-sm">
          <Input
            type="date"
            aria-label="From date"
            className="h-8 w-38"
            value={data?.from ?? search.from ?? ''}
            max={data?.to ?? search.to}
            onChange={(event) => event.target.value && setSearch({ from: event.target.value })}
          />
          <span className="text-muted-foreground">to</span>
          <Input
            type="date"
            aria-label="To date"
            className="h-8 w-38"
            value={data?.to ?? search.to ?? ''}
            min={data?.from ?? search.from}
            onChange={(event) => event.target.value && setSearch({ to: event.target.value })}
          />
        </div>
        <MultiFilter
          label="Status"
          selected={statuses}
          options={Object.entries(LEAD_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          onToggle={(value) => setSearch({ status: joined(toggle(statuses, value)) })}
        />
        <MultiFilter
          label="Source"
          selected={sources}
          options={Object.entries(LEAD_SOURCE_LABELS).map(([value, label]) => ({ value, label }))}
          onToggle={(value) => setSearch({ source: joined(toggle(sources, value)) })}
        />
        <Select
          value={search.sort ?? 'newest'}
          onValueChange={(value) => setSearch({ sort: value as LeadsSearch['sort'] })}
        >
          <SelectTrigger className="h-8 w-40" aria-label="Sort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((sort) => (
              <SelectItem key={sort.value} value={sort.value}>
                {sort.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {query.isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Grade">
        {GRADES.map((grade) => {
          const on = grades.includes(grade.value);
          return (
            <button
              key={grade.value}
              type="button"
              aria-pressed={on}
              onClick={() => setSearch({ grade: joined(toggle(grades, grade.value)) })}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                on
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {grade.label}
            </button>
          );
        })}
      </div>

      {query.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-12 w-full" />
          ))}
        </div>
      ) : query.isError || !data ? (
        <p className="text-sm text-destructive">
          {errorMessage(query.error, 'Could not load leads. Please try again.')}
        </p>
      ) : data.items.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="text-sm font-medium">No leads match these filters</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Try a longer period or clear some filters.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn('space-y-3 transition-opacity', query.isPlaceholderData && 'opacity-60')}
        >
          <p className="text-xs text-muted-foreground">
            {start}–{start + data.items.length - 1} of {data.total} leads
          </p>
          <div className="overflow-x-auto rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Lead</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Answers</TableHead>
                  <TableHead>Came from</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((lead) => (
                  <LeadRow
                    key={lead.id}
                    lead={lead}
                    onOpen={() =>
                      void navigate({ to: '/conversations', search: { lead: lead.id } })
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
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

function MultiFilter({
  label,
  selected,
  options,
  onToggle,
}: {
  label: string;
  selected: string[];
  options: { value: string; label: string }[];
  onToggle: (value: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          {label}
          {selected.length > 0 && (
            <span className="rounded-full bg-primary/12 px-1.5 text-xs text-primary tabular-nums">
              {selected.length}
            </span>
          )}
          <ChevronDown data-icon="inline-end" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            key={option.value}
            checked={selected.includes(option.value)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={() => onToggle(option.value)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LeadRow({ lead, onOpen }: { lead: LeadListItem; onOpen: () => void }) {
  const progress = lead.requiredTotal ? lead.requiredDone / lead.requiredTotal : 0;
  return (
    <TableRow
      className="cursor-pointer"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => event.key === 'Enter' && onOpen()}
    >
      <TableCell>
        <div className="font-medium">{lead.name ?? lead.phone}</div>
        {lead.name && <div className="text-xs text-muted-foreground">{lead.phone}</div>}
      </TableCell>
      <TableCell>
        {lead.grade && lead.score !== null ? (
          <div className="flex items-center gap-2" title={lead.scoreReason ?? undefined}>
            <GradeBadge grade={lead.grade} />
            <span className="text-sm tabular-nums">{lead.score}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Not scored</span>
        )}
      </TableCell>
      <TableCell>
        <LeadStatusBadge status={lead.status} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
            <div
              className={cn('h-full rounded-full', progress === 1 ? 'bg-success' : 'bg-primary')}
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">
            {lead.requiredDone}/{lead.requiredTotal}
          </span>
        </div>
      </TableCell>
      <TableCell className="max-w-56">
        <div className="text-sm">
          {LEAD_SOURCE_LABELS[lead.source as keyof typeof LEAD_SOURCE_LABELS] ?? lead.source}
        </div>
        {lead.origin && (
          <div className="truncate text-xs text-muted-foreground" title={lead.origin}>
            {lead.origin}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm whitespace-nowrap">{shortDate(lead.createdAt)}</TableCell>
      <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
        {lead.lastMessageAt ? timeAgo(lead.lastMessageAt) : '—'}
      </TableCell>
    </TableRow>
  );
}
