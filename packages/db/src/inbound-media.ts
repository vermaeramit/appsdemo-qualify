import { createHash } from 'node:crypto';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from './client.ts';
import { organization } from './schema/auth.ts';
import { inboundMedia } from './schema/inbound-media.ts';
import { messages } from './schema/messaging.ts';
import { type Transaction, withTenant } from './tenant.ts';

export type InboundMediaRow = typeof inboundMedia.$inferSelect;

/** Queues a received file for download (once per message). Call inside withTenant. */
export async function queueInboundMedia(
  tx: Transaction,
  input: {
    tenantId: string;
    leadId: string;
    messageId: string;
    waMediaId: string;
    fileName?: string | null;
  },
): Promise<boolean> {
  const rows = await tx
    .insert(inboundMedia)
    .values({
      tenantId: input.tenantId,
      leadId: input.leadId,
      messageId: input.messageId,
      waMediaId: input.waMediaId,
      fileName: input.fileName ?? null,
    })
    .onConflictDoNothing({ target: inboundMedia.messageId })
    .returning({ id: inboundMedia.id });
  return rows.length > 0;
}

/** What the worker needs to download one file: the media id and the number it arrived on. */
export async function inboundMediaToDownload(
  db: Database,
  tenantId: string,
  messageId: string,
): Promise<{ media: InboundMediaRow; phoneNumberId: string } | null> {
  return withTenant(db, tenantId, async (tx) => {
    const [row] = await tx
      .select({ media: inboundMedia, phoneNumberId: messages.phoneNumberId })
      .from(inboundMedia)
      .innerJoin(messages, eq(messages.id, inboundMedia.messageId))
      .where(eq(inboundMedia.messageId, messageId))
      .limit(1);
    return row ?? null;
  });
}

/** Stores a downloaded file. */
export async function storeInboundMedia(
  db: Database,
  tenantId: string,
  messageId: string,
  file: { bytes: Buffer; mime: string },
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(inboundMedia)
      .set({
        status: 'stored',
        bytes: file.bytes,
        mime: file.mime,
        size: file.bytes.length,
        sha256: createHash('sha256').update(file.bytes).digest('hex'),
        error: null,
      })
      .where(eq(inboundMedia.messageId, messageId)),
  );
}

/** Records why a file isn't kept (too large, or the download failed). */
export async function markInboundMedia(
  db: Database,
  tenantId: string,
  messageId: string,
  update: {
    status: 'too_large' | 'failed';
    size?: number | null;
    mime?: string | null;
    error?: string | null;
  },
): Promise<void> {
  await withTenant(db, tenantId, (tx) =>
    tx
      .update(inboundMedia)
      .set({
        status: update.status,
        ...(update.size !== undefined ? { size: update.size } : {}),
        ...(update.mime !== undefined ? { mime: update.mime } : {}),
        error: update.error?.slice(0, 500) ?? null,
      })
      .where(eq(inboundMedia.messageId, messageId)),
  );
}

/** The file states of these messages, without the bytes (the conversation). Inside withTenant. */
export async function inboundMediaByMessage(
  tx: Transaction,
  messageIds: readonly string[],
): Promise<Map<string, Omit<InboundMediaRow, 'bytes'>>> {
  if (!messageIds.length) return new Map();
  const rows = await tx
    .select({
      id: inboundMedia.id,
      tenantId: inboundMedia.tenantId,
      leadId: inboundMedia.leadId,
      messageId: inboundMedia.messageId,
      waMediaId: inboundMedia.waMediaId,
      status: inboundMedia.status,
      mime: inboundMedia.mime,
      fileName: inboundMedia.fileName,
      size: inboundMedia.size,
      sha256: inboundMedia.sha256,
      error: inboundMedia.error,
      createdAt: inboundMedia.createdAt,
      updatedAt: inboundMedia.updatedAt,
    })
    .from(inboundMedia)
    .where(inArray(inboundMedia.messageId, [...messageIds]));
  return new Map(rows.map((row) => [row.messageId, row]));
}

/** One stored file with its bytes, for the dashboard to show. Inside withTenant. */
export async function inboundMediaFile(
  tx: Transaction,
  leadId: string,
  messageId: string,
): Promise<{ bytes: Buffer; mime: string; fileName: string | null } | null> {
  const [row] = await tx
    .select({ bytes: inboundMedia.bytes, mime: inboundMedia.mime, fileName: inboundMedia.fileName })
    .from(inboundMedia)
    .where(
      and(
        eq(inboundMedia.messageId, messageId),
        eq(inboundMedia.leadId, leadId),
        eq(inboundMedia.status, 'stored'),
      ),
    )
    .limit(1);
  return row?.bytes
    ? { bytes: row.bytes, mime: row.mime ?? 'application/octet-stream', fileName: row.fileName }
    : null;
}

/**
 * Files still waiting for a download after `olderThanMinutes` (the job was lost, e.g. Redis was
 * down when the message arrived), newer than `withinDays` (Meta keeps files 30 days), in every
 * workspace: the worker queues them again.
 */
export async function stalePendingInboundMedia(
  db: Database,
  options: { olderThanMinutes: number; withinDays: number; limitPerWorkspace?: number },
): Promise<{ tenantId: string; messageId: string }[]> {
  const workspaces = await db.select({ id: organization.id }).from(organization);
  const stale: { tenantId: string; messageId: string }[] = [];
  for (const workspace of workspaces) {
    const rows = await withTenant(db, workspace.id, (tx) =>
      tx
        .select({ messageId: inboundMedia.messageId })
        .from(inboundMedia)
        .where(
          and(
            eq(inboundMedia.status, 'pending'),
            lt(
              inboundMedia.createdAt,
              sql`now() - make_interval(mins => ${options.olderThanMinutes})`,
            ),
            gt(inboundMedia.createdAt, sql`now() - make_interval(days => ${options.withinDays})`),
          ),
        )
        .limit(options.limitPerWorkspace ?? 500),
    );
    for (const row of rows) stale.push({ tenantId: workspace.id, messageId: row.messageId });
  }
  return stale;
}

/**
 * Empties files older than `days` in every workspace (each in its own tenant scope): the row
 * stays, marked expired, so the conversation can say the file was removed.
 */
export async function expireInboundMedia(db: Database, days: number): Promise<number> {
  const workspaces = await db.select({ id: organization.id }).from(organization);
  let expired = 0;
  for (const workspace of workspaces) {
    const rows = await withTenant(db, workspace.id, (tx) =>
      tx
        .update(inboundMedia)
        .set({ status: 'expired', bytes: null })
        .where(
          and(
            eq(inboundMedia.status, 'stored'),
            lt(inboundMedia.createdAt, sql`now() - make_interval(days => ${days})`),
          ),
        )
        .returning({ id: inboundMedia.id }),
    );
    expired += rows.length;
  }
  return expired;
}
