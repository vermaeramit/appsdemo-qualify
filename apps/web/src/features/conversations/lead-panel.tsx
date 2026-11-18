import { type ConversationThread, LEAD_OUTCOME_LABELS } from '@qualify/shared';
import { Link } from '@tanstack/react-router';
import { CircleCheck, CircleDashed, ExternalLink } from 'lucide-react';
import { motion } from 'motion/react';
import { SOURCE_LABELS } from '@/features/dashboard/queries';
import { timeAgo } from '@/lib/time';
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

      {lead.outcome && (
        <div className="space-y-1 border-t pt-4 text-sm">
          <span className="text-xs font-medium text-muted-foreground">Outcome (from your CRM)</span>
          <p className="font-medium">
            {LEAD_OUTCOME_LABELS[lead.outcome.outcome]}
            {lead.outcome.value !== undefined &&
              ` · ${lead.outcome.value.toLocaleString()}${lead.outcome.currency ? ` ${lead.outcome.currency}` : ''}`}
          </p>
          {lead.outcome.note && (
            <p className="text-xs break-words text-muted-foreground">{lead.outcome.note}</p>
          )}
        </div>
      )}

      {lead.agentName && (
        <p className="border-t pt-4 text-xs text-muted-foreground">
          Handled by: <span className="font-medium text-foreground">{lead.agentName}</span>
        </p>
      )}

      <LeadSource lead={lead} />

      {lead.language && (
        <p className="text-xs text-muted-foreground">
          Language: <span className="font-medium text-foreground">{lead.language}</span>
        </p>
      )}
    </div>
  );
}

/** Where the latest enquiry came from: the ad the lead tapped, the form, or the API campaign. */
function LeadSource({ lead }: { lead: ConversationThread['lead'] }) {
  const attribution = lead.attribution;
  const channel = attribution?.channel ?? lead.source;
  return (
    <div className="space-y-1.5 border-t pt-4 text-sm">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium text-muted-foreground">Came from</span>
        {attribution && <span className="text-muted-foreground">{timeAgo(attribution.at)}</span>}
      </div>
      <p className="font-medium">{SOURCE_LABELS[channel] ?? channel}</p>
      {attribution?.headline && <p className="break-words">“{attribution.headline}”</p>}
      {attribution?.body && (
        <p className="line-clamp-3 text-xs break-words text-muted-foreground">{attribution.body}</p>
      )}
      {attribution?.channel === 'meta_form' && attribution.formId && (
        <Link
          to="/meta-leads"
          search={{ formId: attribution.formId }}
          className="block text-xs text-primary hover:underline"
        >
          {attribution.formName ?? `Form ${attribution.formId}`}
        </Link>
      )}
      {attribution?.campaign && (
        <p className="text-xs text-muted-foreground">Campaign: {attribution.campaign}</p>
      )}
      {attribution?.adId && (
        <p className="font-mono text-[0.7rem] text-muted-foreground">ad {attribution.adId}</p>
      )}
      {attribution?.sourceUrl && /^https:\/\//.test(attribution.sourceUrl) && (
        <a
          href={attribution.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          View the ad
          <ExternalLink className="size-3" />
        </a>
      )}
    </div>
  );
}
