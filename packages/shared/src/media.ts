import { z } from 'zod';

/** Media a template header can carry (D-084). Limits follow WhatsApp's media rules. */
export const MEDIA_TYPES = {
  'image/jpeg': { kind: 'IMAGE', maxBytes: 5 * 1024 * 1024, label: 'JPEG image' },
  'image/png': { kind: 'IMAGE', maxBytes: 5 * 1024 * 1024, label: 'PNG image' },
  'video/mp4': { kind: 'VIDEO', maxBytes: 16 * 1024 * 1024, label: 'MP4 video' },
  'application/pdf': { kind: 'DOCUMENT', maxBytes: 16 * 1024 * 1024, label: 'PDF' },
} as const;
export type MediaMime = keyof typeof MEDIA_TYPES;
export const MEDIA_MIMES = Object.keys(MEDIA_TYPES) as MediaMime[];

export const mediaKindSchema = z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']);
export type MediaKind = z.infer<typeof mediaKindSchema>;

/** An uploaded file (the bytes stay on the server; GET /api/media/:id serves them). */
export const mediaAssetSchema = z.object({
  id: z.uuid(),
  kind: mediaKindSchema,
  mime: z.string(),
  fileName: z.string(),
  size: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type MediaAsset = z.infer<typeof mediaAssetSchema>;

/** A media header on a template (opening, follow-up, or one made on the Templates page). */
export const templateHeaderMediaSchema = z.object({
  kind: mediaKindSchema,
  assetId: z.uuid(),
  /** Shown to the lead for documents. */
  fileName: z.string().min(1).max(200).optional(),
});
export type TemplateHeaderMedia = z.infer<typeof templateHeaderMediaSchema>;

/**
 * Files leads send on WhatsApp (D-100): downloaded from Meta when they arrive (Meta's links
 * expire within minutes and Meta keeps files 30 days), kept INBOUND_MEDIA_RETENTION_DAYS, shown
 * in the conversation. Bigger files aren't kept.
 */
export const INBOUND_MEDIA_RETENTION_DAYS = 90;
export const INBOUND_MEDIA_MAX_BYTES = 16 * 1024 * 1024;
export const MEDIA_DOWNLOAD_QUEUE = 'media-download';
export const MEDIA_PRUNE_QUEUE = 'media-prune';
/** The WhatsApp message types that carry a file. */
export const INBOUND_MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'] as const;

export const mediaDownloadJobSchema = z.object({
  tenantId: z.string().min(1),
  messageId: z.uuid(),
});
export type MediaDownloadJob = z.infer<typeof mediaDownloadJobSchema>;

export const inboundMediaStatusSchema = z.enum([
  'pending',
  'stored',
  'too_large',
  'failed',
  'expired',
]);
export type InboundMediaStatus = z.infer<typeof inboundMediaStatusSchema>;

/** A received file as the conversation shows it. */
export const inboundMediaSchema = z.object({
  status: inboundMediaStatusSchema,
  /** Where the dashboard loads it from (stored files only). */
  url: z.string().nullable(),
  mime: z.string().nullable(),
  size: z.number().int().nullable(),
  fileName: z.string().nullable(),
});
export type InboundMedia = z.infer<typeof inboundMediaSchema>;
