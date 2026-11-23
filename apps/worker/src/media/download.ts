import {
  type Database,
  eq,
  inboundMediaToDownload,
  markInboundMedia,
  phoneNumbers,
  storeInboundMedia,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import { decryptSecret, MetaApiError } from '@qualify/integrations';
import { INBOUND_MEDIA_MAX_BYTES, type MediaDownloadJob } from '@qualify/shared';
import type { RecordActivity } from '../activity.ts';
import type { Logger } from '../logger.ts';

/** Attempts for one file: Meta's link and the network can fail for a moment. */
export const MEDIA_DOWNLOAD_ATTEMPTS = 5;
export const MEDIA_DOWNLOAD_BACKOFF_MS = 10_000;

/** The part of the WhatsApp client that fetches a received file. */
export interface MediaClient {
  getMedia(mediaId: string): Promise<{ url: string; mime_type: string; file_size?: number }>;
  downloadMedia(
    url: string,
    maxBytes: number,
  ): Promise<{ bytes: Buffer; mime: string } | { tooLarge: number }>;
}

export interface MediaDownloadDeps {
  db: Database;
  logger: Pick<Logger, 'info' | 'warn'>;
  masterKey: Buffer | null;
  createClient: (accessToken: string) => MediaClient;
  activity: RecordActivity;
  /** Largest file kept (defaults to INBOUND_MEDIA_MAX_BYTES). */
  maxBytes?: number;
}

export type MediaDownloadOutcome =
  'stored' | 'too_large' | 'already_done' | 'not_found' | 'no_token';

/** Meta answers these when the file is gone for good (expired or deleted): retrying won't help. */
function isPermanent(error: unknown): boolean {
  return error instanceof MetaApiError && (error.status === 400 || error.status === 404);
}

/**
 * Downloads one file a lead sent (D-100): Meta's media id → a short-lived link → the bytes,
 * stored in inbound_media so the team can see, hear or open it in the conversation. Throws to
 * retry; `isLastAttempt` turns a failure into a "couldn't be downloaded" note instead.
 */
export async function processMediaDownload(
  job: MediaDownloadJob,
  attempt: { isLastAttempt: boolean },
  deps: MediaDownloadDeps,
): Promise<MediaDownloadOutcome> {
  const found = await inboundMediaToDownload(deps.db, job.tenantId, job.messageId);
  if (!found) return 'not_found';
  const { media, phoneNumberId } = found;
  if (media.status !== 'pending' && media.status !== 'failed') return 'already_done';

  const maxBytes = deps.maxBytes ?? INBOUND_MEDIA_MAX_BYTES;
  const fail = async (reason: string) => {
    await markInboundMedia(deps.db, job.tenantId, job.messageId, {
      status: 'failed',
      error: reason,
    });
    await deps.activity({
      tenantId: job.tenantId,
      leadId: media.leadId,
      source: 'whatsapp',
      kind: 'whatsapp.media_failed',
      level: 'warn',
      message: "A file the lead sent couldn't be downloaded from WhatsApp",
      detail: { Reason: reason },
    });
  };

  const client = await tenantClient(deps, job.tenantId, phoneNumberId);
  if (!client) {
    await fail('No WhatsApp access token for this number');
    return 'no_token';
  }

  try {
    const info = await client.getMedia(media.waMediaId);
    if (info.file_size !== undefined && info.file_size > maxBytes) {
      return await tooLarge(deps, job, media.leadId, info.file_size, info.mime_type, maxBytes);
    }
    const file = await client.downloadMedia(info.url, maxBytes);
    if ('tooLarge' in file) {
      return await tooLarge(deps, job, media.leadId, file.tooLarge, info.mime_type, maxBytes);
    }
    // Meta's own type is the reliable one; the download's header is a fallback.
    const mime = info.mime_type || file.mime;
    await storeInboundMedia(deps.db, job.tenantId, job.messageId, { bytes: file.bytes, mime });
    deps.logger.info(
      { tenantId: job.tenantId, messageId: job.messageId, size: file.bytes.length, mime },
      'Received file stored',
    );
    return 'stored';
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isPermanent(error) || attempt.isLastAttempt) {
      await fail(reason);
      return 'not_found';
    }
    throw error;
  }
}

async function tooLarge(
  deps: MediaDownloadDeps,
  job: MediaDownloadJob,
  leadId: string,
  size: number,
  mime: string,
  maxBytes: number,
): Promise<'too_large'> {
  await markInboundMedia(deps.db, job.tenantId, job.messageId, {
    status: 'too_large',
    size,
    mime: mime || null,
  });
  await deps.activity({
    tenantId: job.tenantId,
    leadId,
    source: 'whatsapp',
    kind: 'whatsapp.media_too_large',
    level: 'warn',
    message: `A file the lead sent is larger than ${Math.round(maxBytes / 1024 / 1024)} MB, so it isn't kept`,
    detail: { 'Size (MB)': Math.round((size / 1024 / 1024) * 10) / 10 },
  });
  return 'too_large';
}

async function tenantClient(
  deps: MediaDownloadDeps,
  tenantId: string,
  phoneNumberId: string,
): Promise<MediaClient | null> {
  if (!deps.masterKey) return null;
  const [account] = await withTenant(deps.db, tenantId, (tx) =>
    tx
      .select({ accessTokenEnc: whatsappAccounts.accessTokenEnc })
      .from(phoneNumbers)
      .innerJoin(whatsappAccounts, eq(phoneNumbers.whatsappAccountId, whatsappAccounts.id))
      .where(eq(phoneNumbers.phoneNumberId, phoneNumberId))
      .limit(1),
  );
  return account ? deps.createClient(decryptSecret(account.accessTokenEnc, deps.masterKey)) : null;
}
