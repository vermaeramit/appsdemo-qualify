import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { apiKeys } from './schema/index.ts';
import type { Transaction } from './tenant.ts';

const KEY_PREFIX = 'qk_live_';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key, 'utf8').digest('hex');
}

/** Creates a key (call inside withTenant). The plain key is returned ONCE and never stored. */
export async function createApiKey(
  tx: Transaction,
  input: { tenantId: string; name: string; createdBy: string | null },
): Promise<{ id: string; key: string; prefix: string }> {
  const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  const prefix = key.slice(0, KEY_PREFIX.length + 4);
  const [row] = await tx
    .insert(apiKeys)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      prefix,
      keyHash: hashApiKey(key),
      createdBy: input.createdBy,
    })
    .returning({ id: apiKeys.id });
  return { id: row!.id, key, prefix };
}

/** Tenant of an active key, without tenant context (SECURITY DEFINER lookup, migration 0007). */
export async function resolveTenantByApiKey(db: Database, key: string): Promise<string | null> {
  if (!key.startsWith(KEY_PREFIX)) return null;
  const result = await db.execute<{ tenant_id: string | null }>(
    sql`select resolve_tenant_by_api_key_hash(${hashApiKey(key)}) as tenant_id`,
  );
  return result.rows[0]?.tenant_id ?? null;
}
