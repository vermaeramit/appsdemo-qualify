import { useMemo, useState } from 'react';
import {
  type AgentSummary,
  type CreateEmailReport,
  type EmailReport,
  emailReportInputSchema,
  REPORT_FREQUENCY_LABELS,
  REPORT_MAX_RECIPIENTS,
  type ReportFrequency,
  reportFrequencySchema,
  WEEKDAY_LABELS,
} from '@qualify/shared';
import { Loader2, Plus, X } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { GRADE_OPTIONS } from './grades';
import { Chip } from './webhook-form';

const PERIOD_HINT: Record<ReportFrequency, string> = {
  daily: 'Covers the leads of the day before.',
  weekly: 'Covers the 7 days before the day it goes out.',
  monthly: 'Goes out on the 1st and covers the month before.',
};

const DEFAULT_NAMES: Record<ReportFrequency, string> = {
  daily: 'Daily leads report',
  weekly: 'Weekly leads report',
  monthly: 'Monthly leads report',
};

const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/** Every IANA zone the browser knows, with the current one first. */
function timeZones(current: string): string[] {
  let zones: string[];
  try {
    zones = Intl.supportedValuesOf('timeZone');
  } catch {
    zones = [];
  }
  return [current, ...zones.filter((zone) => zone !== current && zone !== 'UTC'), 'UTC'].filter(
    (zone, index, list) => list.indexOf(zone) === index,
  );
}

type FieldErrors = Partial<Record<'name' | 'recipients' | 'sendTime' | 'form', string>>;

/** Name, recipients, schedule and which leads of an e-mail report (add and edit). */
export function ReportForm({
  initial,
  agents,
  submitLabel,
  pending,
  error,
  onSubmit,
}: {
  initial?: EmailReport;
  agents: AgentSummary[];
  submitLabel: string;
  pending: boolean;
  error: string | null;
  onSubmit: (value: CreateEmailReport) => void;
}) {
  const [name, setName] = useState(initial?.name ?? DEFAULT_NAMES.daily);
  const [recipients, setRecipients] = useState<string[]>(initial?.recipients ?? []);
  const [typed, setTyped] = useState('');
  const [frequency, setFrequency] = useState<ReportFrequency>(initial?.frequency ?? 'daily');
  const [weekday, setWeekday] = useState(initial?.weekday ?? 1);
  const [sendTime, setSendTime] = useState(initial?.sendTime ?? '09:00');
  const [timeZone, setTimeZone] = useState(initial?.timeZone ?? browserTimeZone());
  const [grades, setGrades] = useState<CreateEmailReport['grades']>(initial?.grades ?? []);
  const [agentId, setAgentId] = useState<string | null>(initial?.agentId ?? null);
  const [skipEmpty, setSkipEmpty] = useState(initial?.skipEmpty ?? false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const zones = useMemo(() => timeZones(timeZone), [timeZone]);

  const addTyped = (): boolean => {
    const parts = typed
      .split(/[\s,;]+/)
      .map((part) => part.trim().toLowerCase())
      .filter(Boolean);
    if (!parts.length) return true;
    const bad = parts.find((part) => !z.email().safeParse(part).success);
    if (bad) {
      setErrors((current) => ({ ...current, recipients: `“${bad}” is not an e-mail address` }));
      return false;
    }
    const next = [...new Set([...recipients, ...parts])];
    if (next.length > REPORT_MAX_RECIPIENTS) {
      setErrors((current) => ({
        ...current,
        recipients: `Up to ${REPORT_MAX_RECIPIENTS} addresses`,
      }));
      return false;
    }
    setRecipients(next);
    setTyped('');
    setErrors((current) => ({ ...current, recipients: undefined }));
    return true;
  };

  const toggle = <T,>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // An address still in the box counts, so "type and press Save" works.
        if (!addTyped()) return;
        const pendingTyped = typed
          .split(/[\s,;]+/)
          .map((part) => part.trim().toLowerCase())
          .filter(Boolean);
        const parsed = emailReportInputSchema.safeParse({
          name,
          recipients: [...new Set([...recipients, ...pendingTyped])],
          frequency,
          weekday,
          sendTime,
          timeZone,
          grades,
          agentId,
          skipEmpty,
          enabled: initial?.enabled ?? true,
        });
        if (!parsed.success) {
          const next: FieldErrors = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (key === 'name' || key === 'recipients' || key === 'sendTime') {
              next[key] ??= issue.message;
            } else {
              next.form ??= issue.message;
            }
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSubmit(parsed.data);
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="report-name">Name</Label>
        <Input
          id="report-name"
          maxLength={80}
          value={name}
          aria-invalid={Boolean(errors.name)}
          onChange={(event) => setName(event.target.value)}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="report-recipients">Send to</Label>
        {recipients.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Recipients">
            {recipients.map((email) => (
              <li
                key={email}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs text-primary"
              >
                {email}
                <button
                  type="button"
                  aria-label={`Remove ${email}`}
                  className="rounded-full p-0.5 hover:bg-primary/15"
                  onClick={() =>
                    setRecipients((current) => current.filter((item) => item !== email))
                  }
                >
                  <X className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <Input
            id="report-recipients"
            type="email"
            inputMode="email"
            placeholder="name@company.com"
            value={typed}
            aria-invalid={Boolean(errors.recipients)}
            onChange={(event) => setTyped(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ',') {
                event.preventDefault();
                addTyped();
              }
            }}
          />
          <Button type="button" variant="outline" disabled={!typed.trim()} onClick={addTyped}>
            <Plus data-icon="inline-start" />
            Add
          </Button>
        </div>
        {errors.recipients ? (
          <p className="text-xs text-destructive">{errors.recipients}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Up to {REPORT_MAX_RECIPIENTS} people. They don't need an account.
          </p>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">How often</legend>
        <div
          className="inline-flex gap-1 rounded-lg bg-muted p-1"
          role="group"
          aria-label="How often"
        >
          {reportFrequencySchema.options.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={frequency === option}
              onClick={() => {
                // A name nobody typed follows the frequency ("Weekly leads report").
                if (Object.values(DEFAULT_NAMES).includes(name)) setName(DEFAULT_NAMES[option]);
                setFrequency(option);
              }}
              className={cn(
                'rounded-md px-3 py-1 text-sm font-medium transition-colors',
                frequency === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {REPORT_FREQUENCY_LABELS[option]}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{PERIOD_HINT[frequency]}</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {frequency === 'weekly' && (
            <div className="space-y-1.5">
              <Label htmlFor="report-weekday">Day</Label>
              <Select value={String(weekday)} onValueChange={(value) => setWeekday(Number(value))}>
                <SelectTrigger id="report-weekday" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAY_LABELS.map((label, index) => (
                    <SelectItem key={label} value={String(index + 1)}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="report-time">Time</Label>
            <Input
              id="report-time"
              type="time"
              step={60}
              value={sendTime}
              aria-invalid={Boolean(errors.sendTime)}
              onChange={(event) => setSendTime(event.target.value.slice(0, 5))}
            />
            {errors.sendTime && <p className="text-xs text-destructive">{errors.sendTime}</p>}
          </div>
          <div className={cn('space-y-1.5', frequency === 'weekly' ? '' : 'sm:col-span-2')}>
            <Label htmlFor="report-timezone">Time zone</Label>
            <Select value={timeZone} onValueChange={setTimeZone}>
              <SelectTrigger id="report-timezone" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {zones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone.replace(/_/g, ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Which leads</legend>
        <p className="text-xs text-muted-foreground">Leave all off to include every grade.</p>
        <div className="flex flex-wrap gap-1.5">
          {GRADE_OPTIONS.map((grade) => (
            <Chip
              key={grade.value}
              on={grades.includes(grade.value)}
              onClick={() => setGrades((current) => toggle(current, grade.value))}
            >
              {grade.label}
            </Chip>
          ))}
        </div>
        {agents.length > 1 && (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="report-agent">Agent</Label>
            <Select
              value={agentId ?? 'all'}
              onValueChange={(value) => setAgentId(value === 'all' ? null : value)}
            >
              <SelectTrigger id="report-agent" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <label className="flex items-center gap-2 pt-1 text-sm">
          <Switch checked={skipEmpty} onCheckedChange={setSkipEmpty} />
          Don't send when there are no new leads
        </label>
      </fieldset>

      {(error ?? errors.form) && <p className="text-sm text-destructive">{error ?? errors.form}</p>}
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
