import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';

export interface LeadLock {
  /** Runs `fn` while holding the lock. Returns `{ acquired: false }` when someone else holds it. */
  withLock<T>(
    key: string,
    fn: () => Promise<T>,
  ): Promise<{ acquired: true; result: T } | { acquired: false }>;
}

// Release only if we still own the lock (it may have expired and been taken by another worker).
const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0`;

/** Redis lock so two workers never answer the same lead at the same time. */
export function createRedisLock(redis: Redis, ttlMs = 120_000): LeadLock {
  return {
    async withLock(key, fn) {
      const token = randomUUID();
      const ok = await redis.set(key, token, 'PX', ttlMs, 'NX');
      if (ok !== 'OK') return { acquired: false };
      try {
        return { acquired: true, result: await fn() };
      } finally {
        await redis.eval(RELEASE_SCRIPT, 1, key, token);
      }
    },
  };
}

/** In-memory lock for tests. */
export function createMemoryLock(): LeadLock {
  const held = new Set<string>();
  return {
    async withLock(key, fn) {
      if (held.has(key)) return { acquired: false };
      held.add(key);
      try {
        return { acquired: true, result: await fn() };
      } finally {
        held.delete(key);
      }
    },
  };
}
