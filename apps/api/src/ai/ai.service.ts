import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { aiCostUsd } from '@qualify/core';
import {
  aiPlatformSpendThisMonth,
  type AiModelRow,
  cachedAiPrices,
  type DbHandle,
  eq,
  getAiSettings,
  listAiModels,
  loadAiTenantState,
  organization,
  recordAiUsage,
  saveAiModels,
  saveAiSettings,
  withTenant,
} from '@qualify/db';
import {
  type AiResolver,
  apiKeyHint,
  checkOpenAiKey,
  createAiResolver,
  encryptSecret,
  fetchOpenRouterPrices,
  type LlmUsage,
  parseMasterKey,
} from '@qualify/integrations';
import type {
  AdminWorkspaceAi,
  AiModel,
  ImportedAiPrices,
  SaveAiKeyInput,
  SaveAiModelsInput,
  SetWorkspaceAiInput,
  WorkspaceAi,
} from '@qualify/shared';
import { recordApiActivity } from '../activity/record';
import type { WorkspaceContext } from '../auth/workspace.guard';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

function toModel(row: AiModelRow): AiModel {
  return {
    id: row.id,
    label: row.label,
    inputUsd: row.inputUsd,
    cachedUsd: row.cachedUsd,
    outputUsd: row.outputUsd,
    enabled: row.enabled,
    source: row.source,
    pricesUpdatedAt: row.pricesUpdatedAt.toISOString(),
  };
}

const usd = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`;

/**
 * AI provider per workspace (D-094): the workspace's own OpenAI key or AppsDemo's (switched on
 * by a platform admin, with a monthly limit), the model, the price list, and the resolver the
 * test chat uses (the worker builds the same one).
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly masterKey: Buffer | null;
  private readonly prices: ReturnType<typeof cachedAiPrices>;
  readonly resolver: AiResolver;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
    this.prices = cachedAiPrices(handle.db);
    this.resolver = createAiResolver({
      provider: env.LLM_PROVIDER,
      platformKey: env.OPENAI_API_KEY ?? null,
      masterKey: this.masterKey,
      defaultModel: env.AI_MODEL_CHAT,
      reasoningEffort: env.AI_REASONING_EFFORT,
      load: (tenantId) => loadAiTenantState(handle.db, tenantId),
      costOf: (usage) => this.costOf(usage),
      record: async (entry) => {
        const error = await recordAiUsage(handle.db, entry);
        if (error) this.logger.warn(`AI usage not recorded: ${String(error)}`);
      },
    });
  }

  async costOf(
    usage: Pick<LlmUsage, 'model' | 'inputTokens' | 'cachedInputTokens' | 'outputTokens'>,
  ) {
    return aiCostUsd(usage, await this.prices().catch(() => undefined));
  }

  /** The price table and the date of its newest price (Costs page). */
  async priceTable() {
    const rows = await listAiModels(this.handle.db);
    const newest = rows.reduce<Date | null>(
      (latest, row) => (!latest || row.pricesUpdatedAt > latest ? row.pricesUpdatedAt : latest),
      null,
    );
    return {
      prices: Object.fromEntries(
        rows.map((row) => [
          row.id,
          { input: row.inputUsd, cached: row.cachedUsd, output: row.outputUsd },
        ]),
      ),
      asOf: newest ? newest.toISOString().slice(0, 10) : null,
    };
  }

  /** The workspace's AI as its team sees it. */
  async view(workspace: WorkspaceContext): Promise<WorkspaceAi> {
    const models = (await listAiModels(this.handle.db)).filter((model) => model.enabled);
    const { settings, spent } = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const settings = await getAiSettings(tx);
      const spent = settings?.mode === 'platform' ? await aiPlatformSpendThisMonth(tx) : 0;
      return { settings, spent };
    });
    const mode = settings?.mode ?? 'off';
    const limit = mode === 'platform' ? (settings?.monthlyLimitUsd ?? null) : null;
    return {
      mode,
      keyHint: settings?.apiKeyHint ?? null,
      model: settings?.model ?? this.env.AI_MODEL_CHAT,
      defaultModel: this.env.AI_MODEL_CHAT,
      models: models.map(toModel),
      monthlyLimitUsd: limit,
      spentThisMonthUsd: spent,
      limitReached: limit !== null && spent >= limit,
    };
  }

  /** Saves the workspace's own key after OpenAI accepts it; the AI then uses it. */
  async saveKey(workspace: WorkspaceContext, input: SaveAiKeyInput, actor: string): Promise<void> {
    if (!this.masterKey) {
      throw new ServiceUnavailableException(
        'Saving keys needs ENCRYPTION_MASTER_KEY on the server',
      );
    }
    await this.requireEnabledModel(input.model);
    const check = await checkOpenAiKey(input.apiKey);
    if (!check.ok) {
      if (check.reason === 'invalid') throw new BadRequestException(check.message);
      throw new ServiceUnavailableException(check.message);
    }
    if (check.models.length && !check.models.includes(input.model)) {
      throw new BadRequestException(`This key can't use ${input.model}. Pick another model.`);
    }
    const hint = apiKeyHint(input.apiKey);
    await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      saveAiSettings(tx, workspace.tenantId, {
        mode: 'own_key',
        apiKeyEnc: encryptSecret(input.apiKey, this.masterKey!),
        apiKeyHint: hint,
        model: input.model,
        monthlyLimitUsd: null,
      }),
    );
    await recordApiActivity(this.handle.db, {
      tenantId: workspace.tenantId,
      source: 'team',
      kind: 'team.ai_key_saved',
      message: `${actor} saved the workspace's OpenAI key: the AI now uses it`,
      detail: { Key: hint, Model: input.model },
    });
  }

  /** Changes the model (own key only: with AppsDemo's key, AppsDemo picks it). */
  async setModel(workspace: WorkspaceContext, model: string, actor: string): Promise<void> {
    await this.requireEnabledModel(model);
    await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const settings = await getAiSettings(tx);
      if (settings?.mode !== 'own_key') {
        throw new ConflictException(
          "The model can be changed here once the workspace uses its own OpenAI key. With AppsDemo's key, AppsDemo sets it.",
        );
      }
      await saveAiSettings(tx, workspace.tenantId, { model });
    });
    await recordApiActivity(this.handle.db, {
      tenantId: workspace.tenantId,
      source: 'team',
      kind: 'team.ai_model_changed',
      message: `${actor} changed the AI model to ${model}`,
    });
  }

  /** Removes the workspace's own key; the AI goes off unless AppsDemo's key is on. */
  async removeKey(workspace: WorkspaceContext, actor: string): Promise<void> {
    const mode = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const settings = await getAiSettings(tx);
      const next = settings?.mode === 'platform' ? 'platform' : 'off';
      await saveAiSettings(tx, workspace.tenantId, {
        mode: next,
        apiKeyEnc: null,
        apiKeyHint: null,
      });
      return next;
    });
    await recordApiActivity(this.handle.db, {
      tenantId: workspace.tenantId,
      source: 'team',
      kind: 'team.ai_key_removed',
      level: mode === 'off' ? 'warn' : 'info',
      message:
        mode === 'off'
          ? `${actor} removed the workspace's OpenAI key: the AI is off`
          : `${actor} removed the workspace's OpenAI key (AppsDemo's key stays on)`,
    });
  }

  // ── Platform admin ────────────────────────────────────────────────────────────────────────

  async models(): Promise<AiModel[]> {
    return (await listAiModels(this.handle.db)).map(toModel);
  }

  async saveModels(input: SaveAiModelsInput): Promise<AiModel[]> {
    await saveAiModels(this.handle.db, input.models);
    return this.models();
  }

  /** Current list prices from OpenRouter, next to ours, to review before saving. */
  async importPrices(): Promise<ImportedAiPrices> {
    // OpenAI's own model list (free; with AppsDemo's key) keeps out what its API doesn't serve.
    const [imported, served] = await Promise.all([
      fetchOpenRouterPrices().catch((error: unknown) => {
        this.logger.warn(`Price import failed: ${String(error)}`);
        throw new ServiceUnavailableException("Couldn't load prices from OpenRouter. Try again.");
      }),
      this.env.OPENAI_API_KEY
        ? checkOpenAiKey(this.env.OPENAI_API_KEY)
        : Promise.resolve({ ok: false as const }),
    ]);
    const openAiIds = served.ok && served.models.length ? new Set(served.models) : null;
    const current = new Map((await listAiModels(this.handle.db)).map((row) => [row.id, row]));
    return {
      source: 'openrouter',
      fetchedAt: new Date().toISOString(),
      models: imported
        .filter((model) => !openAiIds || openAiIds.has(model.id) || current.has(model.id))
        .map((model) => {
          const ours = current.get(model.id);
          return {
            ...model,
            current: ours
              ? { inputUsd: ours.inputUsd, cachedUsd: ours.cachedUsd, outputUsd: ours.outputUsd }
              : null,
          };
        }),
    };
  }

  /** The admin overview's AI column, from values read in the overview's own query. */
  overviewAi(raw: {
    mode: AdminWorkspaceAi['mode'] | null;
    model: string | null;
    monthlyLimitUsd: number | null;
    spentUsd: number;
  }): AdminWorkspaceAi {
    const mode = raw.mode ?? 'off';
    return {
      mode,
      model: mode === 'off' ? null : (raw.model ?? this.env.AI_MODEL_CHAT),
      monthlyLimitUsd: mode === 'platform' ? raw.monthlyLimitUsd : null,
      spentThisMonthUsd: mode === 'platform' ? raw.spentUsd : 0,
    };
  }

  /** A workspace's AI on the admin page. */
  async adminView(tenantId: string): Promise<AdminWorkspaceAi> {
    return withTenant(this.handle.db, tenantId, async (tx) => {
      const settings = await getAiSettings(tx);
      const mode = settings?.mode ?? 'off';
      return {
        mode,
        model: mode === 'off' ? null : (settings?.model ?? this.env.AI_MODEL_CHAT),
        monthlyLimitUsd: mode === 'platform' ? (settings?.monthlyLimitUsd ?? null) : null,
        spentThisMonthUsd: mode === 'platform' ? await aiPlatformSpendThisMonth(tx) : 0,
      };
    });
  }

  /**
   * Switches AppsDemo's key on for a workspace (model, monthly limit), or off again: back to the
   * workspace's own key when it saved one, else the AI is off.
   */
  async setWorkspaceAi(workspaceId: string, input: SetWorkspaceAiInput, adminName: string) {
    const [workspace] = await this.handle.db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, workspaceId))
      .limit(1);
    if (!workspace) throw new NotFoundException('Workspace not found');
    const by = `${adminName.trim() || 'Someone'} from platform support`;

    if (input.mode === 'platform') {
      if (!this.env.OPENAI_API_KEY) {
        throw new ConflictException("AppsDemo's AI key (OPENAI_API_KEY) is not set on the server");
      }
      const known = (await listAiModels(this.handle.db)).some((model) => model.id === input.model);
      if (!known) throw new BadRequestException(`${input.model} is not in the model list`);
      await withTenant(this.handle.db, workspaceId, (tx) =>
        saveAiSettings(tx, workspaceId, {
          mode: 'platform',
          model: input.model,
          monthlyLimitUsd: input.monthlyLimitUsd,
          platformBy: adminName,
        }),
      );
      await recordApiActivity(this.handle.db, {
        tenantId: workspaceId,
        source: 'team',
        kind: 'team.ai_platform_on',
        message: `${by} switched on AppsDemo's AI key for this workspace`,
        detail: {
          Model: input.model,
          'Monthly limit': input.monthlyLimitUsd === null ? 'No limit' : usd(input.monthlyLimitUsd),
        },
      });
    } else {
      const mode = await withTenant(this.handle.db, workspaceId, async (tx) => {
        const settings = await getAiSettings(tx);
        const next = settings?.apiKeyEnc ? 'own_key' : 'off';
        await saveAiSettings(tx, workspaceId, {
          mode: next,
          monthlyLimitUsd: null,
          platformBy: null,
        });
        return next;
      });
      await recordApiActivity(this.handle.db, {
        tenantId: workspaceId,
        source: 'team',
        kind: 'team.ai_platform_off',
        level: mode === 'off' ? 'warn' : 'info',
        message:
          mode === 'off'
            ? `${by} switched off AppsDemo's AI key: the AI is off`
            : `${by} switched off AppsDemo's AI key: the workspace's own key is used again`,
      });
    }
    return this.adminView(workspaceId);
  }

  private async requireEnabledModel(model: string): Promise<void> {
    const rows = await listAiModels(this.handle.db);
    if (!rows.some((row) => row.id === model && row.enabled)) {
      throw new BadRequestException(`${model} is not one of the available models`);
    }
  }
}
