import type { AgentSummary } from '@qualify/shared';
import { useNavigate } from '@tanstack/react-router';
import { Route as RouteIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AgentSettingsDialog } from './agent-dialogs';
import { routingSummary } from './routing';

/** Which leads the agent being edited handles, and its settings (D-086, D-087). */
export function AgentRoutingBar({
  agent,
  agentCount,
  canEdit,
}: {
  agent: AgentSummary;
  agentCount: number;
  canEdit: boolean;
}) {
  const navigate = useNavigate();
  const noRules = !agent.isDefault && agent.routes.length === 0;
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border bg-card px-4 py-2.5',
        noRules && 'border-grade-warm/40 bg-grade-warm/8',
      )}
    >
      <RouteIcon
        className={cn('size-4 shrink-0 text-muted-foreground', noRules && 'text-grade-warm')}
      />
      <p className="min-w-0 grow basis-64 text-sm text-muted-foreground">
        {routingSummary(agent, agentCount)}
      </p>
      {canEdit && (
        <AgentSettingsDialog agent={agent} onDeleted={() => void navigate({ to: '/agent' })} />
      )}
    </div>
  );
}
