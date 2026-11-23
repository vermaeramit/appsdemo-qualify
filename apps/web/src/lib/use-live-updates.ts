import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

// Kinds stay plain strings: one this build doesn't know (a newer api) is skipped, not the event.
const changeSchema = z.object({
  kinds: z.array(z.string()),
  leadIds: z.array(z.string()),
});

/** Which cached queries go stale when a kind of data changes. */
const AFFECTED: Record<string, string[][]> = {
  messages: [['conversations'], ['leads'], ['dashboard'], ['costs']],
  leads: [['conversations'], ['leads'], ['dashboard']],
  lead_form_submissions: [['meta-leads'], ['leads']],
  activity_log: [['activity']],
  // A file a lead sent was downloaded (D-100): the open conversation shows it.
  inbound_media: [['conversations']],
};

/**
 * Live updates (D-079): the api streams "what changed" over Server-Sent Events and the
 * dashboard refetches the affected queries at once. Polling stays as a slower fallback.
 * The workspace id keys the connection, so switching workspace reconnects.
 */
export function useLiveUpdates(workspaceId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;
    const source = new EventSource('/api/live', { withCredentials: true });
    source.addEventListener('change', (event) => {
      let parsed;
      try {
        parsed = changeSchema.safeParse(JSON.parse((event as MessageEvent<string>).data));
      } catch {
        return;
      }
      if (!parsed.success) return;
      const keys = new Map<string, string[]>();
      for (const kind of parsed.data.kinds) {
        for (const key of AFFECTED[kind] ?? []) keys.set(key.join('/'), key);
      }
      for (const key of keys.values()) void queryClient.invalidateQueries({ queryKey: key });
    });
    return () => source.close();
  }, [queryClient, workspaceId]);
}
