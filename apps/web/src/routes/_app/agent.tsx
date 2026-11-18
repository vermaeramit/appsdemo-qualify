import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentBar } from '@/features/agent/agent-bar';
import { PlaybookEditor } from '@/features/agent/playbook-editor';
import {
  AgentIdContext,
  agentPlaybookQueryOptions,
  agentsQueryOptions,
} from '@/features/agent/queries';
import { ApiError } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';

export const Route = createFileRoute('/_app/agent')({
  // ?agent=<id> picks a non-default agent (D-086).
  validateSearch: z.object({ agent: z.uuid().optional().catch(undefined) }),
  component: AgentPage,
});

function AgentPage() {
  const workspace = useActiveWorkspace();
  const { agent: agentId } = Route.useSearch();
  const agents = useQuery(agentsQueryOptions);
  const playbook = useQuery(agentPlaybookQueryOptions(agentId));
  const current =
    agents.data?.agents.find((agent) => agent.id === agentId) ??
    agents.data?.agents.find((agent) => agent.isDefault);

  if (playbook.isPending || agents.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-96" />
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-14 w-full" />
        ))}
      </div>
    );
  }
  if (playbook.isError || !current) {
    const missing = playbook.error instanceof ApiError && playbook.error.status === 404;
    return (
      <p className="text-sm text-destructive">
        {missing
          ? 'This workspace has no agent configuration yet.'
          : 'Could not load the agent configuration.'}
      </p>
    );
  }
  return (
    <AgentIdContext.Provider value={agentId}>
      <div className="space-y-4">
        <AgentBar
          agents={agents.data?.agents ?? []}
          current={current}
          canEdit={canManage(workspace.role)}
        />
        <PlaybookEditor
          key={playbook.data.versionId}
          playbook={playbook.data}
          canEdit={canManage(workspace.role)}
        />
      </div>
    </AgentIdContext.Provider>
  );
}
