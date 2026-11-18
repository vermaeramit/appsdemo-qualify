import { type Database, getMediaAsset, rememberWhatsAppMedia, withTenant } from '@qualify/db';
import type { MessageHeaderMedia, WhatsAppClient } from '@qualify/integrations';
import type { TemplateHeaderMedia } from '@qualify/shared';

/** WhatsApp media ids live 30 days; we re-upload a day early. */
const MEDIA_ID_LIFETIME_MS = 29 * 24 * 3_600_000;
const SAFETY_MS = 24 * 3_600_000;

/**
 * The WhatsApp media id of a template header file for one number: the cached id while it is
 * valid, otherwise the file is uploaded again (D-084). Null when the file no longer exists.
 */
export async function headerMediaFor(
  deps: { db: Database; now?: () => Date },
  input: {
    tenantId: string;
    client: Pick<WhatsAppClient, 'uploadMedia'>;
    phoneNumberId: string;
    media: TemplateHeaderMedia;
  },
): Promise<MessageHeaderMedia | null> {
  const now = (deps.now ?? (() => new Date()))();
  const asset = await withTenant(deps.db, input.tenantId, (tx) =>
    getMediaAsset(tx, input.media.assetId),
  );
  if (!asset) return null;
  const header = (mediaId: string): MessageHeaderMedia => ({
    kind: input.media.kind,
    mediaId,
    fileName: input.media.fileName ?? asset.fileName,
  });
  if (
    asset.waMediaId &&
    asset.waPhoneNumberId === input.phoneNumberId &&
    asset.waMediaExpiresAt &&
    asset.waMediaExpiresAt.getTime() - SAFETY_MS > now.getTime()
  ) {
    return header(asset.waMediaId);
  }
  const waMediaId = await input.client.uploadMedia(input.phoneNumberId, {
    bytes: asset.bytes,
    mime: asset.mime,
    fileName: asset.fileName,
  });
  await withTenant(deps.db, input.tenantId, (tx) =>
    rememberWhatsAppMedia(tx, {
      id: asset.id,
      phoneNumberId: input.phoneNumberId,
      waMediaId,
      expiresAt: new Date(now.getTime() + MEDIA_ID_LIFETIME_MS),
    }),
  );
  return header(waMediaId);
}
