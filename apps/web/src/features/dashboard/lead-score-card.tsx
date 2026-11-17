import { CircleCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { ScoreGauge } from '@/components/leads/score-gauge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { sampleScoreBreakdown as sample } from './sample-data';

export function LeadScoreCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Lead score</CardTitle>
        <CardDescription>
          {sample.lead} · {sample.trip}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center py-1">
          <ScoreGauge score={sample.score} grade={sample.grade} />
        </div>
        <ul className="space-y-2 text-sm">
          {sample.items.map((item, index) => (
            <motion.li
              key={item.label}
              className="flex items-center justify-between gap-3"
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + index * 0.07 }}
            >
              <span className="text-muted-foreground">{item.label}</span>
              <span className="font-medium tabular-nums">+{item.points}</span>
            </motion.li>
          ))}
        </ul>
        <Separator />
        <div className="flex items-center justify-between text-sm font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{sample.score} / 100</span>
        </div>
      </CardContent>
      <CardFooter className="border-t text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 py-3">
          <CircleCheck className="size-3.5 text-success" />
          Webhook delivered to CRM · 10:42 AM
        </span>
      </CardFooter>
    </Card>
  );
}
