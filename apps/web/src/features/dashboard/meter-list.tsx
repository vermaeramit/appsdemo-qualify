import { motion } from 'motion/react';

interface MeterRow {
  key: string;
  label: string;
  count: number;
}

/** Name, bar and figure per row, bars aligned, one hue (share of the total). */
export function MeterList({ rows, emptyText }: { rows: MeterRow[]; emptyText: string }) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return <p className="py-4 text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const share = row.count / total;
        return (
          <li
            key={row.key}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm"
          >
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-primary/12">
              {row.count > 0 && (
                <motion.span
                  className="block h-full rounded-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${share * 100}%` }}
                  transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                />
              )}
            </span>
            <span className="w-16 text-right font-medium tabular-nums">
              {row.count}
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                {Math.round(share * 100)}%
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
