import {
  ACTIVITY_RETENTION_DAYS,
  ACTIVITY_SOURCE_LABELS,
  ACTIVITY_SOURCES,
  type ActivitySource,
} from '@qualify/shared';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';
import { seesManagerViews } from '@/lib/workspace';
import { ActivityList } from './activity-list';
import { MetaConnectionCard } from './meta-health';

export interface LogsSearch {
  source?: ActivitySource | undefined;
  problems?: boolean | undefined;
}

/** Workspace Logs (D-091): the activity of every lead, with the Meta connection on top. */
export function LogsPage({ search }: { search: LogsSearch }) {
  const workspace = useActiveWorkspace();
  const navigate = useNavigate({ from: '/logs' });
  const setSearch = (next: LogsSearch) =>
    void navigate({ search: (current) => ({ ...current, ...next }), replace: true });
  const manager = seesManagerViews(workspace);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="text-sm text-muted-foreground">
          What happened to your leads, step by step: messages, AI replies, openings, follow-ups,
          webhooks and your team's actions. Kept for {ACTIVITY_RETENTION_DAYS} days.
        </p>
      </div>

      <MetaConnectionCard
        {...(manager ? { onShowProblems: () => setSearch({ problems: true }) } : {})}
      />

      {!manager ? (
        <Card>
          <CardContent className="text-sm text-muted-foreground">
            Only owners and managers can see the logs of every lead. Each conversation has its own
            Activity (top right of the chat).
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Show">
              {[undefined, ...ACTIVITY_SOURCES].map((source) => {
                const active = search.source === source;
                return (
                  <button
                    key={source ?? 'all'}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSearch({ source })}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs transition-colors',
                      active
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'bg-background hover:bg-muted',
                    )}
                  >
                    {source ? ACTIVITY_SOURCE_LABELS[source] : 'All'}
                  </button>
                );
              })}
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <Switch
                checked={Boolean(search.problems)}
                onCheckedChange={(checked) => setSearch({ problems: checked || undefined })}
              />
              Problems only
            </label>
          </div>
          <Card>
            <CardContent>
              <ActivityList
                filters={{ source: search.source, problems: search.problems }}
                showLead
                emptyText={
                  search.problems
                    ? 'No problems in this view. 🎉'
                    : 'Nothing recorded yet. Activity shows up here as leads come in and get answered.'
                }
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
