import type { ReactNode } from 'react';
import type { DashboardPeriod, DashboardResponse } from '@qualify/shared';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Flame,
  Inbox,
  Minus,
  Timer,
  type LucideIcon,
} from 'lucide-react';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@/components/animated-number';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const PREVIOUS: Record<DashboardPeriod, string> = {
  today: 'yesterday by this time',
  '7d': 'the 7 days before',
  '30d': 'the 30 days before',
};

/** "9s", "1m 5s", "2h 3m". */
function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  if (rounded < 60) return `${rounded}s`;
  if (rounded < 3600) return `${Math.floor(rounded / 60)}m ${rounded % 60}s`;
  return `${Math.floor(rounded / 3600)}h ${Math.floor((rounded % 3600) / 60)}m`;
}

function Delta({
  current,
  previous,
  period,
}: {
  current: number;
  previous: number;
  period: DashboardPeriod;
}) {
  const diff = current - previous;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        diff > 0 && 'text-success',
        diff < 0 && 'text-destructive',
        diff === 0 && 'text-muted-foreground',
      )}
    >
      <Icon className="size-3.5" />
      {diff > 0 ? `+${diff}` : diff}
      <span className="ml-1 font-normal text-muted-foreground">vs {PREVIOUS[period]}</span>
    </span>
  );
}

interface Tile {
  label: string;
  icon: LucideIcon;
  accent: string;
  value: ReactNode;
  hint: ReactNode;
}

/** Four headline numbers for the selected period, all from real leads and messages. */
export function KpiCards({ data }: { data: DashboardResponse }) {
  const { kpis, period } = data;
  const rate = kpis.newLeads > 0 ? Math.round((kpis.qualified / kpis.newLeads) * 100) : null;

  const tiles: Tile[] = [
    {
      label: 'New leads',
      icon: Inbox,
      accent: 'text-primary bg-primary/10',
      value: <AnimatedNumber value={kpis.newLeads} />,
      hint: <Delta current={kpis.newLeads} previous={kpis.previousNewLeads} period={period} />,
    },
    {
      label: 'Qualified',
      icon: BadgeCheck,
      accent: 'text-success bg-success/10',
      value: <AnimatedNumber value={kpis.qualified} />,
      hint: rate === null ? 'No new leads in this period' : `${rate}% of new leads, so far`,
    },
    {
      label: 'Hot leads',
      icon: Flame,
      accent: 'text-grade-hot bg-grade-hot/10',
      value: <AnimatedNumber value={kpis.grades.hot} />,
      hint: `${kpis.grades.warm} warm · ${kpis.grades.cold} cold · ${kpis.handoffs} asked for a person`,
    },
    {
      label: 'Median AI reply time',
      icon: Timer,
      accent: 'text-grade-cold bg-grade-cold/10',
      value:
        kpis.medianReplySeconds === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <AnimatedNumber value={kpis.medianReplySeconds} format={formatDuration} />
        ),
      hint:
        kpis.replySamples === 0
          ? 'No AI replies in this period'
          : `Across ${kpis.replySamples} ${kpis.replySamples === 1 ? 'reply' : 'replies'}, incl. a short wait for follow-up messages`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {tiles.map(({ label, icon: Icon, accent, value, hint }, index) => (
        <motion.div
          key={label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
        >
          <Card className="h-full transition-shadow hover:shadow-md hover:shadow-foreground/5">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {label}
                </span>
                <span className={`grid size-7 shrink-0 place-items-center rounded-md ${accent}`}>
                  <Icon className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-semibold tracking-tight sm:text-3xl">{value}</div>
              <p className="text-xs text-muted-foreground">{hint}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
