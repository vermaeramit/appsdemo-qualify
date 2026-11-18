import type { DashboardResponse } from '@qualify/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const PLOT_HEIGHT = 168;

/** Bucket keys are local times: "2026-11-18" or "2026-11-18T14". */
function bucketDate(bucket: string): Date {
  const [day = '', hour] = bucket.split('T');
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1, hour ? Number(hour) : 0);
}

function fullLabel(bucket: string, hourly: boolean): string {
  const date = bucketDate(bucket);
  if (hourly) {
    const end = new Date(date.getTime() + 3_600_000);
    const time = (value: Date) => value.toLocaleTimeString([], { hour: 'numeric' });
    return `${time(date)}–${time(end)}`;
  }
  return date.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
}

function axisLabel(bucket: string, index: number, count: number, hourly: boolean): string | null {
  const date = bucketDate(bucket);
  if (hourly) return index % 6 === 0 ? date.toLocaleTimeString([], { hour: 'numeric' }) : null;
  if (count <= 7) return date.toLocaleDateString([], { weekday: 'short', day: 'numeric' });
  const step = 5;
  return (count - 1 - index) % step === 0
    ? date.toLocaleDateString([], { day: 'numeric', month: 'short' })
    : null;
}

/** Clean axis maximum and ticks: 1, 2, 5 × 10^n steps. */
function niceTicks(max: number): number[] {
  if (max <= 4) return Array.from({ length: Math.max(max, 1) + 1 }, (_, i) => i);
  const rough = max / 4;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= rough) ?? power * 10;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** New leads per hour (today) or per day, covering the selected period. */
export function LeadsChart({ data }: { data: DashboardResponse }) {
  const hourly = data.bucket === 'hour';
  const { series } = data;
  const total = series.reduce((sum, point) => sum + point.leads, 0);
  const peak = series.reduce(
    (best, point) => (point.leads > best.leads ? point : best),
    series[0]!,
  );
  const ticks = niceTicks(peak?.leads ?? 0);
  const top = ticks.at(-1) || 1;

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>New leads per {hourly ? 'hour' : 'day'}</CardTitle>
        <CardDescription>
          {total === 0
            ? 'No new leads in this period yet.'
            : `${total} ${total === 1 ? 'lead' : 'leads'} in this period. Hover a column for details.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 pt-3">
          {/* Y axis */}
          <div
            className="relative w-6 shrink-0 text-right text-[0.65rem] text-muted-foreground tabular-nums"
            style={{ height: PLOT_HEIGHT }}
            aria-hidden
          >
            {ticks.map((tick) => (
              <span
                key={tick}
                className="absolute right-0 -translate-y-1/2"
                style={{ bottom: `${(tick / top) * 100}%` }}
              >
                {tick}
              </span>
            ))}
          </div>

          <div className="min-w-0 flex-1">
            <div className="relative" style={{ height: PLOT_HEIGHT }}>
              {/* Hairline grid */}
              {ticks.map((tick) => (
                <div
                  key={tick}
                  className="absolute inset-x-0 border-t border-border"
                  style={{ bottom: `${(tick / top) * 100}%` }}
                  aria-hidden
                />
              ))}
              <div className="absolute inset-0 flex items-end">
                {series.map((point) => {
                  const height = (point.leads / top) * 100;
                  const isPeak = point === peak && point.leads > 0;
                  return (
                    <Tooltip key={point.bucket}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none focus-visible:bg-muted/60"
                          aria-label={`${fullLabel(point.bucket, hourly)}: ${point.leads} leads, ${point.qualified} qualified`}
                        >
                          {point.leads > 0 && (
                            <span
                              className="relative w-[70%] max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                              style={{ height: `${height}%` }}
                            >
                              {isPeak && (
                                <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[0.65rem] font-medium text-foreground">
                                  {point.leads}
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <div className="space-y-0.5">
                          <div className="font-semibold">
                            {point.leads} {point.leads === 1 ? 'lead' : 'leads'}
                            <span className="font-normal opacity-80">
                              {' '}
                              · {point.qualified} qualified
                            </span>
                          </div>
                          <div className="opacity-80">{fullLabel(point.bucket, hourly)}</div>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
            {/* X axis */}
            <div className="relative mt-1.5 h-4 text-[0.65rem] text-muted-foreground" aria-hidden>
              {series.map((point, index) => {
                const label = axisLabel(point.bucket, index, series.length, hourly);
                if (!label) return null;
                const last = index === series.length - 1;
                // Edge labels hug the plot edges so they never overflow the card.
                const style = last
                  ? { right: 0 }
                  : index === 0
                    ? { left: 0 }
                    : {
                        left: `${((index + 0.5) / series.length) * 100}%`,
                        transform: 'translateX(-50%)',
                      };
                return (
                  <span
                    key={point.bucket}
                    className="absolute top-0 whitespace-nowrap"
                    style={style}
                  >
                    {label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table view of the same numbers for screen readers. */}
        <table className="sr-only">
          <caption>New leads per {hourly ? 'hour' : 'day'}</caption>
          <thead>
            <tr>
              <th>{hourly ? 'Hour' : 'Day'}</th>
              <th>New leads</th>
              <th>Qualified</th>
            </tr>
          </thead>
          <tbody>
            {series.map((point) => (
              <tr key={point.bucket}>
                <td>{fullLabel(point.bucket, hourly)}</td>
                <td>{point.leads}</td>
                <td>{point.qualified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
