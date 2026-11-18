import { z } from 'zod';

/** A workspace API key as listed in Settings (the secret itself is never returned again). */
export const apiKeySummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  /** First characters of the key, e.g. "qk_live_ab12", to recognise it. */
  prefix: z.string(),
  createdAt: z.iso.datetime(),
  lastUsedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export type ApiKeySummary = z.infer<typeof apiKeySummarySchema>;

export const apiKeyListSchema = z.object({ keys: z.array(apiKeySummarySchema) });
export type ApiKeyList = z.infer<typeof apiKeyListSchema>;

export const createApiKeyRequestSchema = z.object({
  name: z.string().trim().min(1, 'Give the key a name').max(60),
});
export type CreateApiKeyRequest = z.infer<typeof createApiKeyRequestSchema>;

/** Returned once, right after creation. */
export const createdApiKeySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  prefix: z.string(),
  key: z.string(),
});
export type CreatedApiKey = z.infer<typeof createdApiKeySchema>;
