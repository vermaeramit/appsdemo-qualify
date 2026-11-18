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
