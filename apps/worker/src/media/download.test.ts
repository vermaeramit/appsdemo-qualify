// Integration test (D-100): a photo/voice note/document from a lead → queued → downloaded from
// Meta → stored for the dashboard; too large, gone and failing files leave a note instead.
import { randomBytes } from 'node:crypto';
import { inboundMedia, inboundMetaEvents, messages, withTenant } from '@qualify/db';
import { MetaApiError } from '@qualify/integrations';
import type { MediaDownloadJob } from '@qualify/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActivityRecorder } from '../activity.ts';
import { processMetaEvent, type ProcessorDeps } from '../meta-events/process-meta-event.ts';
import {
  activityOf,
  ALLOWED,
  PHONE_NUMBER_ID,
  startTestDb,
  TENANT,
  type TestDb,
} from '../test/test-db.ts';
import {
  type MediaClient,
  type MediaDownloadDeps,
  mediaDownloadJobId,
  processMediaDownload,
} from './download.ts';

const masterKey = randomBytes(32);
let testDb: TestDb;
let enqueueMediaDownload: ReturnType<typeof vi.fn<(job: MediaDownloadJob) => Promise<void>>>;

function processorDeps(): ProcessorDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    allowlist: [ALLOWED],
    isProduction: false,
    enqueueRespond: vi.fn(async () => undefined),
    enqueueMediaDownload,
    activity: createActivityRecorder(testDb.app.db, { warn: vi.fn() }),
  };
}

function downloadDeps(client: MediaClient, maxBytes?: number): MediaDownloadDeps {
  return {
    db: testDb.app.db,
    logger: { info: vi.fn(), warn: vi.fn() },
    masterKey,
    createClient: () => client,
    activity: createActivityRecorder(testDb.app.db, { warn: vi.fn() }),
    ...(maxBytes ? { maxBytes } : {}),
  };
}

/** A webhook with one received file of `type` (image, audio, document…). */
async function receiveFile(
  waMessageId: string,
  type: string,
  media: Record<string, unknown>,
): Promise<string> {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_DEV',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '919350983656', phone_number_id: PHONE_NUMBER_ID },
              contacts: [{ wa_id: ALLOWED, profile: { name: 'Rahul Sharma' } }],
              messages: [
                { id: waMessageId, from: ALLOWED, timestamp: '1763400000', type, [type]: media },
              ],
            },
          },
        ],
      },
    ],
  };
  const [event] = await testDb.app.db
    .insert(inboundMetaEvents)
    .values({ object: 'whatsapp_business_account', payload })
    .returning({ id: inboundMetaEvents.id });
  return event!.id;
}

async function messageId(waMessageId: string): Promise<string> {
  const rows = await withTenant(testDb.app.db, TENANT, (tx) => tx.select().from(messages));
  return rows.find((row) => row.waMessageId === waMessageId)!.id;
}

async function mediaRow(id: string) {
  const rows = await withTenant(testDb.app.db, TENANT, (tx) => tx.select().from(inboundMedia));
  return rows.find((row) => row.messageId === id);
}

function fakeClient(file: { bytes: Buffer; mime: string; size?: number }) {
  return {
    getMedia: vi.fn(async () => ({
      url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1',
      mime_type: file.mime,
      ...(file.size !== undefined ? { file_size: file.size } : {}),
    })),
    downloadMedia: vi.fn(async () => ({ bytes: file.bytes, mime: file.mime })),
  } satisfies MediaClient;
}

beforeAll(async () => {
  testDb = await startTestDb(masterKey);
}, 180_000);

afterAll(async () => {
  await testDb?.stop();
});

beforeEach(() => {
  enqueueMediaDownload = vi.fn(async () => undefined);
});

describe('received files (D-100)', () => {
  it('names each download job with an id BullMQ accepts (no ":")', () => {
    const id = mediaDownloadJobId('923260aa-61f0-4a33-8777-a6d7620e475b');
    expect(id).toBe('media-923260aa-61f0-4a33-8777-a6d7620e475b');
    expect(id).not.toContain(':');
  });

  it('queues a photo once, downloads it and keeps it for the conversation', async () => {
    const eventId = await receiveFile('wamid.photo.1', 'image', {
      id: 'MEDIA_PHOTO_1',
      mime_type: 'image/jpeg',
      sha256: 'abc',
    });
    await processMetaEvent(eventId, processorDeps());
    const id = await messageId('wamid.photo.1');
    expect(enqueueMediaDownload).toHaveBeenCalledExactlyOnceWith({
      tenantId: TENANT,
      messageId: id,
    });
    expect(await mediaRow(id)).toMatchObject({ status: 'pending', waMediaId: 'MEDIA_PHOTO_1' });

    // Meta sends the same webhook again: nothing new is queued.
    await processMetaEvent(
      await receiveFile('wamid.photo.1', 'image', { id: 'MEDIA_PHOTO_1', mime_type: 'image/jpeg' }),
      processorDeps(),
    );
    expect(enqueueMediaDownload).toHaveBeenCalledOnce();

    const bytes = Buffer.from('fake-jpeg-bytes');
    const client = fakeClient({ bytes, mime: 'image/jpeg', size: bytes.length });
    const outcome = await processMediaDownload(
      { tenantId: TENANT, messageId: id },
      { isLastAttempt: false },
      downloadDeps(client),
    );
    expect(outcome).toBe('stored');
    expect(client.getMedia).toHaveBeenCalledWith('MEDIA_PHOTO_1');
    const stored = await mediaRow(id);
    expect(stored).toMatchObject({ status: 'stored', mime: 'image/jpeg', size: bytes.length });
    expect(stored?.bytes?.equals(bytes)).toBe(true);
    expect(stored?.sha256).toMatch(/^[0-9a-f]{64}$/);

    // A second run (a retried job) leaves the stored file alone.
    const again = fakeClient({ bytes, mime: 'image/jpeg' });
    expect(
      await processMediaDownload(
        { tenantId: TENANT, messageId: id },
        { isLastAttempt: false },
        downloadDeps(again),
      ),
    ).toBe('already_done');
    expect(again.getMedia).not.toHaveBeenCalled();
  });

  it('keeps a document’s file name', async () => {
    await processMetaEvent(
      await receiveFile('wamid.doc.1', 'document', {
        id: 'MEDIA_DOC_1',
        mime_type: 'application/pdf',
        filename: 'Passport.pdf',
      }),
      processorDeps(),
    );
    expect(await mediaRow(await messageId('wamid.doc.1'))).toMatchObject({
      fileName: 'Passport.pdf',
      status: 'pending',
    });
  });

  it('does not keep a file larger than the limit, and says so in the activity', async () => {
    await processMetaEvent(
      await receiveFile('wamid.video.1', 'video', { id: 'MEDIA_VIDEO_1', mime_type: 'video/mp4' }),
      processorDeps(),
    );
    const id = await messageId('wamid.video.1');
    const client = fakeClient({ bytes: Buffer.alloc(0), mime: 'video/mp4', size: 2_000 });
    const outcome = await processMediaDownload(
      { tenantId: TENANT, messageId: id },
      { isLastAttempt: false },
      downloadDeps(client, 1_000),
    );
    expect(outcome).toBe('too_large');
    expect(client.downloadMedia).not.toHaveBeenCalled();
    const row = await mediaRow(id);
    expect(row).toMatchObject({ status: 'too_large', size: 2_000, mime: 'video/mp4', bytes: null });
    const activity = await activityOf(testDb.app.db, row!.leadId);
    expect(activity.at(-1)).toMatchObject({ kind: 'whatsapp.media_too_large', level: 'warn' });
  });

  it('retries a failing download, and on the last attempt notes that it failed', async () => {
    await processMetaEvent(
      await receiveFile('wamid.voice.1', 'audio', {
        id: 'MEDIA_VOICE_1',
        mime_type: 'audio/ogg; codecs=opus',
        voice: true,
      }),
      processorDeps(),
    );
    const id = await messageId('wamid.voice.1');
    const client: MediaClient = {
      getMedia: vi.fn(async () => {
        throw new Error('socket hang up');
      }),
      downloadMedia: vi.fn(),
    };
    await expect(
      processMediaDownload(
        { tenantId: TENANT, messageId: id },
        { isLastAttempt: false },
        downloadDeps(client),
      ),
    ).rejects.toThrow('socket hang up');
    expect(await mediaRow(id)).toMatchObject({ status: 'pending' });

    expect(
      await processMediaDownload(
        { tenantId: TENANT, messageId: id },
        { isLastAttempt: true },
        downloadDeps(client),
      ),
    ).toBe('not_found');
    const row = await mediaRow(id);
    expect(row).toMatchObject({ status: 'failed', error: 'socket hang up' });
    const activity = await activityOf(testDb.app.db, row!.leadId);
    expect(activity.at(-1)).toMatchObject({ kind: 'whatsapp.media_failed', level: 'warn' });
  });

  it('gives up at once when Meta no longer has the file', async () => {
    await processMetaEvent(
      await receiveFile('wamid.sticker.1', 'sticker', {
        id: 'MEDIA_GONE',
        mime_type: 'image/webp',
      }),
      processorDeps(),
    );
    const id = await messageId('wamid.sticker.1');
    const client: MediaClient = {
      getMedia: vi.fn(async () => {
        throw new MetaApiError(404, 'Media not found', 100, null);
      }),
      downloadMedia: vi.fn(),
    };
    expect(
      await processMediaDownload(
        { tenantId: TENANT, messageId: id },
        { isLastAttempt: false },
        downloadDeps(client),
      ),
    ).toBe('not_found');
    expect(await mediaRow(id)).toMatchObject({ status: 'failed' });
  });

  it('still schedules the reply when the download can’t be queued (picked up later)', async () => {
    const deps = processorDeps();
    deps.enqueueMediaDownload = vi.fn(async () => {
      throw new Error('Redis down');
    });
    await processMetaEvent(
      await receiveFile('wamid.photo.queue-down', 'image', {
        id: 'MEDIA_Q',
        mime_type: 'image/jpeg',
      }),
      deps,
    );
    expect(deps.enqueueRespond).toHaveBeenCalledOnce();
    expect(deps.logger.warn).toHaveBeenCalled();
    // The row stays pending for the media-prune job to queue again.
    expect(await mediaRow(await messageId('wamid.photo.queue-down'))).toMatchObject({
      status: 'pending',
    });
  });

  it('queues nothing for a text message', async () => {
    const eventId = await receiveFile('wamid.text.media', 'text', { body: 'hello' });
    await processMetaEvent(eventId, processorDeps());
    expect(enqueueMediaDownload).not.toHaveBeenCalled();
  });
});
