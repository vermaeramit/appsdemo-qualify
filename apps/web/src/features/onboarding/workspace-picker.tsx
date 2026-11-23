import { useState } from 'react';
import type { WorkspaceSummary } from '@qualify/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { meQueryOptions } from '@/lib/session';
import { initials, roleLabel } from '@/lib/workspace';

/** Lets a user who already belongs to workspaces open one instead of creating a new one. */
export function WorkspacePicker({ workspaces }: { workspaces: WorkspaceSummary[] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [openingId, setOpeningId] = useState<string | null>(null);

  const open = async (workspace: WorkspaceSummary) => {
    setOpeningId(workspace.id);
    const { error } = await authClient.organization.setActive({ organizationId: workspace.id });
    if (error) {
      setOpeningId(null);
      toast.error(`Could not open ${workspace.name}`);
      return;
    }
    queryClient.removeQueries({ queryKey: meQueryOptions.queryKey });
    await navigate({ to: '/dashboard' });
  };

  return (
    <ul className="divide-y rounded-xl border">
      {workspaces.map((workspace) => (
        <li key={workspace.id}>
          <button
            type="button"
            onClick={() => void open(workspace)}
            disabled={openingId !== null}
            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl hover:bg-muted/60 disabled:opacity-60"
          >
            <span className="grid size-8 place-items-center rounded-md bg-primary/10 text-xs font-semibold text-primary">
              {initials(workspace.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{workspace.name}</span>
              <span className="block text-xs text-muted-foreground">
                {roleLabel(workspace.role)}
              </span>
            </span>
            {openingId === workspace.id ? (
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <ArrowRight className="size-4 text-muted-foreground" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
