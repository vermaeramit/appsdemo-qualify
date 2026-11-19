import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiPost, errorMessage } from '@/lib/api';
import { afterWorkspaceSwitch } from '@/lib/session';
import { clockTime } from '@/lib/time';
import type { ActiveWorkspace } from '@/lib/use-workspace';

/**
 * Leaves the support view (D-092): the API ends the access and opens the admin's own
 * workspace again.
 */
function useExitSupport() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const exit = useCallback(
    async (notice?: string) => {
      setPending(true);
      try {
        await apiPost('/api/admin/support/exit');
        await afterWorkspaceSwitch(queryClient);
        if (notice) toast.info(notice);
        await navigate({ to: '/admin' });
      } catch (error) {
        toast.error(errorMessage(error, 'Could not leave the support view.'));
      } finally {
        setPending(false);
      }
    },
    [queryClient, navigate],
  );
  return { exit, pending };
}

/** Shown on every page while a platform admin views a client's workspace read-only. */
export function SupportBanner({ workspace }: { workspace: ActiveWorkspace }) {
  const { support } = workspace;
  const expiresAt = support?.expiresAt ?? null;
  const { exit, pending } = useExitSupport();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!expiresAt) return;
    const tick = setInterval(() => setNow(Date.now()), 15_000);
    // The API stops the access at expiresAt anyway; this takes the admin back right then.
    const end = setTimeout(
      () => void exit('Support access ended: the time limit was reached.'),
      Math.max(0, Date.parse(expiresAt) - Date.now()),
    );
    return () => {
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [expiresAt, exit]);

  if (!support) return null;
  const minutesLeft = Math.max(0, Math.round((Date.parse(support.expiresAt) - now) / 60_000));
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-primary/25 bg-primary/8 px-4 py-2 md:px-6"
    >
      <Eye className="size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1 text-sm">
        <p>
          <span className="font-medium">Support view of {workspace.name}</span>: read-only, ends at{' '}
          {clockTime(support.expiresAt)} ({minutesLeft} min left).
        </p>
        <p className="truncate text-xs text-muted-foreground" title={support.reason}>
          Reason: {support.reason} · The workspace sees this visit in its Logs.
        </p>
      </div>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => void exit()}>
        {pending && <Loader2 className="animate-spin" data-icon="inline-start" />}
        Exit support view
      </Button>
    </div>
  );
}
