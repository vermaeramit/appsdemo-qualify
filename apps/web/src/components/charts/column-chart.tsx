import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { axisLabel, bucketLabel, niceTicks } from './chart-scales';

const PLOT_HEIGHT = 168;

export interface ColumnPoint {
  /** Local bucket key: "2026-11-18" (day) or "2026-11-18T14" (hour). */
  bucket: string;
  value: number;
}

interface ColumnChartProps {
  points: ColumnPoint[];
  /** Counts get whole-number ticks. */
  integer?: boolean;
  formatValue: (value: number) => string;
  /** Tooltip body for a column (the bucket label is added below it). */
  tooltip: (point: ColumnPoint) => ReactNode;
  ariaLabel: (point: ColumnPoint) => string;
  /** Table view for screen readers. */
  table: { caption: string; valueHeader: string };
}

/**
 * Columns from one baseline, one hue, hairline grid, peak labelled, per-column hover/focus
 * tooltip, and a screen-reader table with the same numbers.
 */
export function ColumnChart({
  points,
  integer = false,
  formatValue,
  tooltip,
  ariaLabel,
  table,
}: ColumnChartProps) {
  const peak = points.reduce<ColumnPoint | undefined>(
    (best, point) => (!best || point.value > best.value ? point : best),
    undefined,
  );
  const ticks = niceTicks(peak?.value ?? 0, integer);
  const top = ticks.at(-1) || 1;

  return (
    <>
      <div className="flex gap-2 pt-3">
        <div
          className="relative w-9 shrink-0 text-right text-[0.65rem] text-muted-foreground tabular-nums"
          style={{ height: PLOT_HEIGHT }}
          aria-hidden
        >
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {integer ? tick : formatValue(tick)}
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div className="relative" style={{ height: PLOT_HEIGHT }}>
            {ticks.map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 border-t border-border"
                style={{ bottom: `${(tick / top) * 100}%` }}
                aria-hidden
              />
            ))}
            <div className="absolute inset-0 flex items-end">
              {points.map((point) => {
                const isPeak = point === peak && point.value > 0;
                return (
                  <Tooltip key={point.bucket}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="group relative flex h-full min-w-0 flex-1 items-end justify-center outline-none focus-visible:bg-muted/60"
                        aria-label={ariaLabel(point)}
                      >
                        {point.value > 0 && (
                          <span
                            className="relative w-[70%] max-w-6 rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
                            style={{ height: `${(point.value / top) * 100}%` }}
                          >
                            {isPeak && (
                              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[0.65rem] font-medium whitespace-nowrap text-foreground">
                                {formatValue(point.value)}
                              </span>
                            )}
                          </span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      <div className="space-y-0.5">
                        <div className="font-semibold">{tooltip(point)}</div>
                        <div className="opacity-80">{bucketLabel(point.bucket)}</div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </div>
          <div className="relative mt-1.5 h-4 text-[0.65rem] text-muted-foreground" aria-hidden>
            {points.map((point, index) => {
              const label = axisLabel(point.bucket, index, points.length);
              if (!label) return null;
              // Edge labels hug the plot edges so they never overflow the card.
              const style =
                index === points.length - 1
                  ? { right: 0 }
                  : index === 0
                    ? { left: 0 }
                    : {
                        left: `${((index + 0.5) / points.length) * 100}%`,
                        transform: 'translateX(-50%)',
                      };
              return (
                <span key={point.bucket} className="absolute top-0 whitespace-nowrap" style={style}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <table className="sr-only">
        <caption>{table.caption}</caption>
        <thead>
          <tr>
            <th>Period</th>
            <th>{table.valueHeader}</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.bucket}>
              <td>{bucketLabel(point.bucket)}</td>
              <td>{formatValue(point.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
