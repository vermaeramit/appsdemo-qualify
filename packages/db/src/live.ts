import pg from 'pg';
import { z } from 'zod';

/** One change notified by the `notify_live_change` trigger (migration 0021). */
export interface LiveChange {
  tenantId: string;
  leadId: string | null;
  kind: 'leads' | 'messages' | 'lead_form_submissions' | 'activity_log';
}

export const LIVE_CHANNEL = 'qualify_live';

const notificationSchema = z.object({
  t: z.string(),
  l: z.string().nullable(),
  k: z.enum(['leads', 'messages', 'lead_form_submissions', 'activity_log']),
});

/**
 * Listens to live change notifications on one dedicated connection and reconnects with backoff
 * when it drops. Returns a function that stops listening.
 */
export function listenToLiveChanges(input: {
  connectionString: string;
  onChange: (change: LiveChange) => void;
  onError?: (error: unknown) => void;
}): () => Promise<void> {
  let client: pg.Client | null = null;
  let stopped = false;
  let delay = 1_000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = async () => {
    if (stopped) return;
    const next = new pg.Client({ connectionString: input.connectionString });
    next.on('notification', (message) => {
      if (message.channel !== LIVE_CHANNEL || !message.payload) return;
      const parsed = notificationSchema.safeParse(JSON.parse(message.payload));
      if (parsed.success) {
        input.onChange({ tenantId: parsed.data.t, leadId: parsed.data.l, kind: parsed.data.k });
      }
    });
    const retry = (error: unknown) => {
      input.onError?.(error);
      next.removeAllListeners();
      void next.end().catch(() => undefined);
      if (client === next) client = null;
      if (!stopped) {
        timer = setTimeout(() => void connect(), delay);
        delay = Math.min(delay * 2, 30_000);
      }
    };
    next.on('error', retry);
    try {
      await next.connect();
      await next.query(`LISTEN ${LIVE_CHANNEL}`);
      client = next;
      delay = 1_000;
    } catch (error) {
      retry(error);
    }
  };
  void connect();

  return async () => {
    stopped = true;
    clearTimeout(timer);
    await client?.end().catch(() => undefined);
  };
}
