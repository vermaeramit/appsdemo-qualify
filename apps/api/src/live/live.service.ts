import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { type LiveChange, listenToLiveChanges } from '@qualify/db';
import type { Env } from '../config/env';
import { ENV } from '../tokens';

/** What a dashboard receives: which kinds of data changed (and for which leads, up to 50). */
export interface LiveEvent {
  kinds: LiveChange['kind'][];
  leadIds: string[];
}

type Listener = (event: LiveEvent) => void;

const FLUSH_MS = 300;
const MAX_LEAD_IDS = 50;

/**
 * Fans Postgres change notifications out to the open dashboards of the same tenant. Bursts (a
 * rescore touching every lead) are coalesced into one event per tenant per 300 ms.
 */
@Injectable()
export class LiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveService.name);
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly pending = new Map<
    string,
    { kinds: Set<LiveChange['kind']>; leadIds: Set<string> }
  >();
  private timer: ReturnType<typeof setInterval> | undefined;
  private stop: (() => Promise<void>) | undefined;

  constructor(@Inject(ENV) private readonly env: Env) {}

  onModuleInit(): void {
    this.stop = listenToLiveChanges({
      connectionString: this.env.APP_DATABASE_URL,
      onChange: (change) => this.collect(change),
      onError: (error) => this.logger.warn(`Live listener reconnecting: ${String(error)}`),
    });
    this.timer = setInterval(() => this.flush(), FLUSH_MS);
  }

  async onModuleDestroy(): Promise<void> {
    clearInterval(this.timer);
    await this.stop?.();
  }

  subscribe(tenantId: string, listener: Listener): () => void {
    const set = this.listeners.get(tenantId) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(tenantId, set);
    return () => {
      set.delete(listener);
      if (!set.size) this.listeners.delete(tenantId);
    };
  }

  private collect(change: LiveChange): void {
    if (!this.listeners.has(change.tenantId)) return; // nobody is watching this workspace
    const entry = this.pending.get(change.tenantId) ?? { kinds: new Set(), leadIds: new Set() };
    entry.kinds.add(change.kind);
    if (change.leadId && entry.leadIds.size < MAX_LEAD_IDS) entry.leadIds.add(change.leadId);
    this.pending.set(change.tenantId, entry);
  }

  private flush(): void {
    for (const [tenantId, entry] of this.pending) {
      const event: LiveEvent = { kinds: [...entry.kinds], leadIds: [...entry.leadIds] };
      for (const listener of this.listeners.get(tenantId) ?? []) listener(event);
    }
    this.pending.clear();
  }
}
