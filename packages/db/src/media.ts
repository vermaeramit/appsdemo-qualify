import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { mediaAssets } from './schema/index.ts';
import type { Transaction } from './tenant.ts';

export type MediaAssetRow = typeof mediaAssets.$inferSelect;

/**
 * Stores an uploaded file for a tenant (call inside withTenant). The same bytes uploaded again
 * return the existing asset.
 */
export async function saveMediaAsset(
  tx: Transaction,
  input: {
    tenantId: string;
    kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
    mime: string;
    fileName: string;
    bytes: Buffer;
  },
): Promise<Omit<MediaAssetRow, 'bytes'>> {
  const sha256 = createHash('sha256').update(input.bytes).digest('hex');
  const columns = {
    id: mediaAssets.id,
    tenantId: mediaAssets.tenantId,
    kind: mediaAssets.kind,
    mime: mediaAssets.mime,
    fileName: mediaAssets.fileName,
    size: mediaAssets.size,
    sha256: mediaAssets.sha256,
    waMediaId: mediaAssets.waMediaId,
    waPhoneNumberId: mediaAssets.waPhoneNumberId,
    waMediaExpiresAt: mediaAssets.waMediaExpiresAt,
    createdAt: mediaAssets.createdAt,
  };
  const [existing] = await tx
    .select(columns)
    .from(mediaAssets)
    .where(and(eq(mediaAssets.sha256, sha256), eq(mediaAssets.mime, input.mime)))
    .limit(1);
  if (existing) return existing;
  const [created] = await tx
    .insert(mediaAssets)
    .values({ ...input, size: input.bytes.length, sha256 })
    .returning(columns);
  return created!;
}

export async function getMediaAsset(tx: Transaction, id: string): Promise<MediaAssetRow | null> {
  const [row] = await tx.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
  return row ?? null;
}

/** Remembers the WhatsApp media id of an asset for one number (valid for 30 days). */
export async function rememberWhatsAppMedia(
  tx: Transaction,
  input: { id: string; phoneNumberId: string; waMediaId: string; expiresAt: Date },
): Promise<void> {
  await tx
    .update(mediaAssets)
    .set({
      waMediaId: input.waMediaId,
      waPhoneNumberId: input.phoneNumberId,
      waMediaExpiresAt: input.expiresAt,
    })
    .where(eq(mediaAssets.id, input.id));
}
