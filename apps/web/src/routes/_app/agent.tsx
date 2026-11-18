import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { Skeleton } from '@/components/ui/skeleton';
import { AgentRoutingBar } from '@/features/agent/agent-routing-bar';
import { AgentsOverview } from '@/features/agent/agents-overview';
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
  // No ?agent: the overview of all agents. ?agent=<id>: that agent's editor (D-086, D-087).
  validateSearch: z.object({ agent: z.uuid().optional().catch(undefined) }),
  component: AgentPage,
});

function AgentPage() {
  const workspace = useActiveWorkspace();
  const { agent: agentId } = Route.useSearch();
  const agents = useQuery(agentsQueryOptions);
  const canEdit = canManage(workspace.role);

  if (agents.isPending) {
    return agentId ? (
      <EditorSkeleton />
    ) : (
      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }
  if (agents.isError) {
    return <p className="text-sm text-destructive">Could not load the agents.</p>;
  }
  const list = agents.data.agents;
  if (!agentId) return <AgentsOverview agents={list} canEdit={canEdit} />;

  const current = list.find((agent) => agent.id === agentId);
  if (!current) {
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-muted-foreground">This agent no longer exists.</p>
      </div>
    );
  }
  return (
    <AgentEditor
      // The default agent uses the plain endpoints, so its caches are shared with other pages.
      agentId={current.isDefault ? undefined : current.id}
      title={current.name}
      banner={<AgentRoutingBar agent={current} agentCount={list.length} canEdit={canEdit} />}
      canEdit={canEdit}
    />
  );
}

function AgentEditor({
  agentId,
  title,
  banner,
  canEdit,
}: {
  agentId: string | undefined;
  title: string;
  banner: ReactNode;
  canEdit: boolean;
}) {
  const playbook = useQuery(agentPlaybookQueryOptions(agentId));
  if (playbook.isPending) return <EditorSkeleton />;
  if (playbook.isError) {
    const missing = playbook.error instanceof ApiError && playbook.error.status === 404;
    return (
      <div className="space-y-3">
        <BackLink />
        <p className="text-sm text-destructive">
          {missing
            ? 'This agent has no configuration yet.'
            : 'Could not load the agent configuration.'}
        </p>
      </div>
    );
  }
  return (
    <AgentIdContext.Provider value={agentId}>
      <div className="space-y-3">
        <BackLink />
        <PlaybookEditor
          key={playbook.data.versionId}
          playbook={playbook.data}
          canEdit={canEdit}
          title={title}
          banner={banner}
        />
      </div>
    </AgentIdContext.Provider>
  );
}

function BackLink() {
  return (
    <Link
      to="/agent"
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="size-4" />
      All agents
    </Link>
  );
}

function EditorSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: 5 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}
