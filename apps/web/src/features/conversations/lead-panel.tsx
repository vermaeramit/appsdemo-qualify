import type { ConversationThread } from '@qualify/shared';
import { CircleCheck, CircleDashed } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { LeadScore } from './lead-score';

/** Score, then the collected qualification fields with progress on the required ones. */
export function LeadPanel({ lead }: { lead: ConversationThread['lead'] }) {
  const required = lead.fieldDefinitions.filter((field) => field.required);
  const done = required.filter((field) => lead.fields[field.key]).length;
  const progress = required.length ? Math.round((done / required.length) * 100) : 0;

  return (
    <div className="space-y-4 p-4">
      <LeadScore lead={lead} />
      <div>
        <div className="flex items-baseline justify-between text-xs">
          <span className="font-medium text-muted-foreground">Qualification</span>
          <span className="tabular-nums">
            {done}/{required.length} required
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
          <motion.div
            className={cn('h-full rounded-full', progress === 100 ? 'bg-success' : 'bg-primary')}
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      <dl className="space-y-2.5">
        {lead.fieldDefinitions.map((field) => {
          const value = lead.fields[field.key];
          return (
            <div key={field.key} className="flex items-start gap-2 text-sm">
              {value ? (
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <CircleDashed
                  className={cn(
                    'mt-0.5 size-4 shrink-0',
                    field.required ? 'text-muted-foreground' : 'text-muted-foreground/40',
                  )}
                />
              )}
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">
                  {field.label}
                  {field.required ? '' : ' (optional)'}
                </dt>
                <dd className={cn('break-words', !value && 'text-muted-foreground/60')}>
                  {value ?? '—'}
                </dd>
              </div>
            </div>
          );
        })}
      </dl>

      {lead.language && (
        <p className="text-xs text-muted-foreground">
          Language: <span className="font-medium text-foreground">{lead.language}</span>
        </p>
      )}
    </div>
  );
}
