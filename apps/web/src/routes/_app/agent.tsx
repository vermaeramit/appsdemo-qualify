import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { Skeleton } from '@/components/ui/skeleton';
import { PlaybookEditor } from '@/features/agent/playbook-editor';
import { playbookQueryOptions } from '@/features/agent/queries';
import { ApiError } from '@/lib/api';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';

export const Route = createFileRoute('/_app/agent')({
  component: AgentPage,
});

function AgentPage() {
  const workspace = useActiveWorkspace();
  const playbook = useQuery(playbookQueryOptions);

  if (playbook.isPending) {
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
  if (playbook.isError) {
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
    <PlaybookEditor
      key={playbook.data.versionId}
      playbook={playbook.data}
      canEdit={canManage(workspace.role)}
    />
  );
}
