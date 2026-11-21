import type { AiKeySource, AiMode, AiUsagePurpose } from '@qualify/shared';
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { aiModels, aiSettings, aiUsage } from './schema/ai.ts';
import { type Transaction, withTenant } from './tenant.ts';

export type AiModelRow = typeof aiModels.$inferSelect;
export type AiSettingsRow = typeof aiSettings.$inferSelect;

/** USD per 1M tokens, by model id: the table cost estimates use. */
export type AiPriceTable = Record<string, { input: number; cached: number; output: number }>;

/** Every model in the platform's list (enabled or not), by id. */
export function listAiModels(db: Database | Transaction): Promise<AiModelRow[]> {
  return db.select().from(aiModels).orderBy(asc(aiModels.id));
}

export async function aiPriceTable(db: Database | Transaction): Promise<AiPriceTable> {
  const rows = await listAiModels(db);
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      { input: row.inputUsd, cached: row.cachedUsd, output: row.outputUsd },
    ]),
  );
}

export interface AiModelInput {
  id: string;
  label?: string | null | undefined;
  inputUsd: number;
  cachedUsd: number;
  outputUsd: number;
  enabled: boolean;
  source: 'manual' | 'openrouter';
}

/** Adds or updates models; the price date moves only when a price really changed. */
export async function saveAiModels(db: Database, models: readonly AiModelInput[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const model of models) {
      await tx
        .insert(aiModels)
        .values({
          id: model.id,
          label: model.label ?? null,
          inputUsd: model.inputUsd,
          cachedUsd: model.cachedUsd,
          outputUsd: model.outputUsd,
          enabled: model.enabled,
          source: model.source,
        })
        .onConflictDoUpdate({
          target: aiModels.id,
          set: {
            label: sql`coalesce(excluded.label, ${aiModels.label})`,
            enabled: sql`excluded.enabled`,
            pricesUpdatedAt: sql`case when (${aiModels.inputUsd}, ${aiModels.cachedUsd}, ${aiModels.outputUsd})
              is distinct from (excluded.input_usd, excluded.cached_usd, excluded.output_usd)
              then now() else ${aiModels.pricesUpdatedAt} end`,
            source: sql`case when (${aiModels.inputUsd}, ${aiModels.cachedUsd}, ${aiModels.outputUsd})
              is distinct from (excluded.input_usd, excluded.cached_usd, excluded.output_usd)
              then excluded.source else ${aiModels.source} end`,
            inputUsd: sql`excluded.input_usd`,
            cachedUsd: sql`excluded.cached_usd`,
            outputUsd: sql`excluded.output_usd`,
          },
        });
    }
  });
}

/** The workspace's AI settings; null = never set (the AI is off). Call inside withTenant. */
export async function getAiSettings(tx: Transaction): Promise<AiSettingsRow | null> {
  const [row] = await tx.select().from(aiSettings).limit(1);
  return row ?? null;
}

export interface AiSettingsPatch {
  mode?: AiMode;
  apiKeyEnc?: string | null;
  apiKeyHint?: string | null;
  model?: string | null;
  monthlyLimitUsd?: number | null;
  platformBy?: string | null;
}

/** Creates or updates the workspace's AI settings. Call inside withTenant. */
export async function saveAiSettings(
  tx: Transaction,
  tenantId: string,
  patch: AiSettingsPatch,
): Promise<AiSettingsRow> {
  const [row] = await tx
    .insert(aiSettings)
    .values({ tenantId, ...patch })
    .onConflictDoUpdate({ target: aiSettings.tenantId, set: { ...patch, updatedAt: new Date() } })
    .returning();
  return row!;
}

/**
 * Spend in USD on AppsDemo's key since the start of this calendar month in the workspace's own
 * time zone. Call inside withTenant.
 */
export async function aiPlatformSpendThisMonth(tx: Transaction): Promise<number> {
  const { rows } = await tx.execute<{ spent: number | null }>(sql`
    select coalesce(sum(u.cost_usd), 0)::float8 as spent
    from ai_usage u
    where u.key_source = 'platform'
      and u.at >= (
        select date_trunc('month', now() at time zone coalesce(t.timezone, 'UTC'))
               at time zone coalesce(t.timezone, 'UTC')
        from tenants t limit 1
      )`);
  return rows[0]?.spent ?? 0;
}

export interface AiUsageEntry {
  tenantId: string;
  leadId?: string | null;
  purpose: AiUsagePurpose;
  model: string;
  keySource: AiKeySource;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}

/** Records one AI call. Never throws (returns the error): bookkeeping must not break a reply. */
export async function recordAiUsage(db: Database, entry: AiUsageEntry): Promise<unknown> {
  try {
    await withTenant(db, entry.tenantId, (tx) =>
      tx.insert(aiUsage).values({
        tenantId: entry.tenantId,
        leadId: entry.leadId ?? null,
        purpose: entry.purpose,
        model: entry.model,
        keySource: entry.keySource,
        inputTokens: entry.inputTokens,
        cachedInputTokens: entry.cachedInputTokens,
        outputTokens: entry.outputTokens,
        costUsd: entry.costUsd,
      }),
    );
    return null;
  } catch (error) {
    return error;
  }
}

/** Reads what the AI resolver needs for one workspace in a single tenant scope. */
export async function loadAiAccess(
  db: Database,
  tenantId: string,
): Promise<{ settings: AiSettingsRow | null; platformSpentUsd: number }> {
  return withTenant(db, tenantId, async (tx) => {
    const settings = await getAiSettings(tx);
    const platformSpentUsd =
      settings?.mode === 'platform' && settings.monthlyLimitUsd !== null
        ? await aiPlatformSpendThisMonth(tx)
        : 0;
    return { settings, platformSpentUsd };
  });
}

/** The AI resolver's view of a workspace (no row = off). */
export async function loadAiTenantState(
  db: Database,
  tenantId: string,
): Promise<{
  mode: AiMode;
  apiKeyEnc: string | null;
  model: string | null;
  monthlyLimitUsd: number | null;
  platformSpentUsd: number;
}> {
  const { settings, platformSpentUsd } = await loadAiAccess(db, tenantId);
  return {
    mode: settings?.mode ?? 'off',
    apiKeyEnc: settings?.apiKeyEnc ?? null,
    model: settings?.model ?? null,
    monthlyLimitUsd: settings?.monthlyLimitUsd ?? null,
    platformSpentUsd,
  };
}

/** The price table, re-read at most every `ttlMs` (prices change rarely). */
export function cachedAiPrices(db: Database, ttlMs = 60_000): () => Promise<AiPriceTable> {
  let cached: { at: number; value: Promise<AiPriceTable> } | null = null;
  return () => {
    if (!cached || Date.now() - cached.at > ttlMs) {
      const value = aiPriceTable(db).catch((error: unknown) => {
        cached = null;
        throw error;
      });
      cached = { at: Date.now(), value };
    }
    return cached.value;
  };
}

/** The model ids workspaces may choose. */
export async function enabledAiModelIds(db: Database | Transaction): Promise<Set<string>> {
  const rows = await db
    .select({ id: aiModels.id })
    .from(aiModels)
    .where(eq(aiModels.enabled, true));
  return new Set(rows.map((row) => row.id));
}
