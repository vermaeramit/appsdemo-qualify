import type { ConversationThread } from '@qualify/shared';
import { Gauge } from 'lucide-react';
import { GradeBadge } from '@/components/leads/grade-badge';
import { ScoreGauge } from '@/components/leads/score-gauge';
import { cn } from '@/lib/utils';

/** Score, grade, why, and the AI summary for one lead (live while qualifying). */
export function LeadScore({ lead }: { lead: ConversationThread['lead'] }) {
  if (lead.score === null || !lead.grade) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
        <Gauge className="mt-0.5 size-4 shrink-0" />
        Not scored yet. The score appears with the first answers.
      </div>
    );
  }
  const details = lead.scoreDetails;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Lead score</span>
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[0.65rem] font-medium',
            details?.final ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary',
          )}
        >
          {details?.final ? 'Final' : 'Live'}
        </span>
      </div>
      <div className="flex flex-col items-center gap-2">
        <ScoreGauge score={lead.score} grade={lead.grade} />
        <GradeBadge grade={lead.grade} />
      </div>
      {lead.summary && <p className="text-xs leading-relaxed">{lead.summary}</p>}
      {details && details.breakdown.length > 0 && (
        <details className="group text-xs">
          <summary className="cursor-pointer text-muted-foreground select-none">
            Why this score
          </summary>
          <ul className="mt-2 space-y-1">
            {details.breakdown.map((item) => (
              <li key={item.label} className="flex justify-between gap-2">
                <span className="min-w-0 break-words text-muted-foreground">{item.label}</span>
                <span className="shrink-0 font-medium tabular-nums">+{item.points}</span>
              </li>
            ))}
            <li className="flex justify-between gap-2 border-t pt-1 font-medium">
              <span>Total</span>
              <span className="tabular-nums">{lead.score}</span>
            </li>
          </ul>
        </details>
      )}
    </div>
  );
}
