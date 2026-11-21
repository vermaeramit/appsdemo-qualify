import { z } from 'zod';

/**
 * AI provider per workspace (D-094). Each workspace either uses its own OpenAI key, or AppsDemo's
 * key (switched on by a platform admin, with a monthly limit), or has the AI off. New workspaces
 * start with the AI off.
 */
export const AI_MODES = ['off', 'own_key', 'platform'] as const;
export const aiModeSchema = z.enum(AI_MODES);
export type AiMode = z.infer<typeof aiModeSchema>;

/** What an AI call was for (the usage record). */
export const AI_USAGE_PURPOSES = [
  'reply',
  'follow_up',
  'summary',
  'form_mapping',
  'test_chat',
] as const;
export const aiUsagePurposeSchema = z.enum(AI_USAGE_PURPOSES);
export type AiUsagePurpose = z.infer<typeof aiUsagePurposeSchema>;

export const aiKeySourceSchema = z.enum(['own', 'platform']);
export type AiKeySource = z.infer<typeof aiKeySourceSchema>;

/** Model ids as OpenAI names them ("gpt-5.4-mini"). */
export const aiModelIdSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9.-]*$/i, 'Use the model id as OpenAI writes it, e.g. gpt-5.4-mini');

const priceSchema = z.number().min(0).max(10_000);

/** A model the platform offers, with its list price in USD per 1M tokens. */
export const aiModelSchema = z.object({
  id: aiModelIdSchema,
  label: z.string().max(80).nullable(),
  inputUsd: priceSchema,
  cachedUsd: priceSchema,
  outputUsd: priceSchema,
  /** Workspaces may pick it. */
  enabled: z.boolean(),
  source: z.enum(['manual', 'openrouter']),
  pricesUpdatedAt: z.iso.datetime(),
});
export type AiModel = z.infer<typeof aiModelSchema>;

/** GET /api/admin/ai/models */
export const aiModelListSchema = z.object({ models: z.array(aiModelSchema) });
export type AiModelList = z.infer<typeof aiModelListSchema>;

/** PUT /api/admin/ai/models (add or update several at once). */
export const saveAiModelsSchema = z.object({
  models: z
    .array(
      z.object({
        id: aiModelIdSchema,
        label: z.string().trim().max(80).nullable().optional(),
        inputUsd: priceSchema,
        cachedUsd: priceSchema,
        outputUsd: priceSchema,
        enabled: z.boolean(),
        source: z.enum(['manual', 'openrouter']).default('manual'),
      }),
    )
    .min(1)
    .max(200),
});
export type SaveAiModelsInput = z.infer<typeof saveAiModelsSchema>;

/** POST /api/admin/ai/models/import: current list prices, to review before saving. */
export const importedAiPricesSchema = z.object({
  source: z.literal('openrouter'),
  fetchedAt: z.iso.datetime(),
  models: z.array(
    z.object({
      id: aiModelIdSchema,
      label: z.string().nullable(),
      inputUsd: priceSchema,
      cachedUsd: priceSchema,
      outputUsd: priceSchema,
      /** What we have today, when the model is already in the list. */
      current: z
        .object({ inputUsd: priceSchema, cachedUsd: priceSchema, outputUsd: priceSchema })
        .nullable(),
    }),
  ),
});
export type ImportedAiPrices = z.infer<typeof importedAiPricesSchema>;

/** GET /api/ai: the workspace's AI, as its team sees it. */
export const workspaceAiSchema = z.object({
  mode: aiModeSchema,
  /** "sk-…abcd" when the workspace saved its own key. */
  keyHint: z.string().nullable(),
  /** The model replies use (the default when none was chosen). */
  model: z.string(),
  defaultModel: z.string(),
  /** Models the workspace may choose, with prices. */
  models: z.array(aiModelSchema),
  /** With AppsDemo's key: the monthly limit (null = none) and this month's spend in USD. */
  monthlyLimitUsd: z.number().nullable(),
  spentThisMonthUsd: z.number(),
  limitReached: z.boolean(),
});
export type WorkspaceAi = z.infer<typeof workspaceAiSchema>;

/** PUT /api/ai/key: the workspace's own OpenAI key (checked with OpenAI before saving). */
export const saveAiKeySchema = z.object({
  apiKey: z
    .string()
    .trim()
    .min(20, 'Paste the whole key')
    .max(400)
    .regex(/^sk-[A-Za-z0-9_-]+$/, 'An OpenAI key starts with "sk-"'),
  model: aiModelIdSchema,
});
export type SaveAiKeyInput = z.infer<typeof saveAiKeySchema>;

/** PUT /api/ai/model (own key only). */
export const setAiModelSchema = z.object({ model: aiModelIdSchema });

/** PUT /api/admin/workspaces/:id/ai: AppsDemo's key on (model, monthly limit) or the AI off. */
export const setWorkspaceAiSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('platform'),
    model: aiModelIdSchema,
    monthlyLimitUsd: z.number().positive().max(100_000).nullable(),
  }),
  z.object({ mode: z.literal('off') }),
]);
export type SetWorkspaceAiInput = z.infer<typeof setWorkspaceAiSchema>;

/** One workspace's AI on the admin page. */
export const adminWorkspaceAiSchema = z.object({
  mode: aiModeSchema,
  model: z.string().nullable(),
  monthlyLimitUsd: z.number().nullable(),
  spentThisMonthUsd: z.number(),
});
export type AdminWorkspaceAi = z.infer<typeof adminWorkspaceAiSchema>;
