import { BadgeCheck, Flame, Inbox, Timer, type LucideIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { AnimatedNumber } from '@/components/animated-number';
import { Card, CardContent } from '@/components/ui/card';
import { sampleKpis, type KpiSample } from './sample-data';

const kpis: { kpi: KpiSample; icon: LucideIcon; accent: string }[] = [
  { kpi: sampleKpis.leadsToday, icon: Inbox, accent: 'text-primary bg-primary/10' },
  { kpi: sampleKpis.qualifiedRate, icon: BadgeCheck, accent: 'text-success bg-success/10' },
  { kpi: sampleKpis.hotLeads, icon: Flame, accent: 'text-grade-hot bg-grade-hot/10' },
  { kpi: sampleKpis.firstResponse, icon: Timer, accent: 'text-grade-cold bg-grade-cold/10' },
];

export function KpiCards() {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {kpis.map(({ kpi, icon: Icon, accent }, index) => (
        <motion.div
          key={kpi.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
        >
          <Card className="h-full transition-shadow hover:shadow-md hover:shadow-foreground/5">
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-muted-foreground sm:text-sm">
                  {kpi.label}
                </span>
                <span className={`grid size-7 place-items-center rounded-md ${accent}`}>
                  <Icon className="size-4" />
                </span>
              </div>
              <div className="text-2xl font-semibold tracking-tight sm:text-3xl">
                <AnimatedNumber value={kpi.value} />
                {kpi.suffix && <span className="text-muted-foreground">{kpi.suffix}</span>}
              </div>
              <p className="text-xs text-muted-foreground">{kpi.hint}</p>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
