import type { InboundMediaRow } from '@qualify/db';
import type { InboundDisplay } from '@qualify/shared';

/**
 * Types a browser shows or plays without running anything (D-100). Everything else (SVG, HTML,
 * Office files, archives…) is served as a download, so a file a lead sends can never act as a
 * page of the dashboard.
 */
const INLINE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/3gpp',
  'audio/ogg',
  'audio/opus',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/amr',
  'application/pdf',
]);

function baseMime(mime: string): string {
  return mime.split(';')[0]!.trim().toLowerCase();
}

export function isInlineMime(mime: string): boolean {
  return INLINE_MIME_TYPES.has(baseMime(mime));
}

/** A download keeps its real type unless the browser could render it as a page. */
export function safeDownloadMime(mime: string): string {
  const base = baseMime(mime);
  return /html|xml|svg|javascript/.test(base) ? 'application/octet-stream' : mime;
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/3gpp': '3gp',
  'audio/ogg': 'ogg',
  'audio/opus': 'opus',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/amr': 'amr',
  'application/pdf': 'pdf',
};

/** `inline` or `attachment`, with the lead's file name (or a generic one) safely encoded. */
export function contentDisposition(inline: boolean, fileName: string | null, mime: string): string {
  const extension = EXTENSIONS[baseMime(mime)];
  const name = (fileName?.trim() || `whatsapp-file${extension ? `.${extension}` : ''}`).slice(
    0,
    200,
  );
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/**
 * One `Range: bytes=…` request (players ask for parts of a voice note or video to know its
 * length and to seek). Null = send the whole file; 'unsatisfiable' = answer 416.
 */
export function parseRange(
  header: string | undefined,
  size: number,
): { start: number; end: number } | 'unsatisfiable' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (match[1] === '' && match[2] === '')) return null; // several ranges or odd: whole file
  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
  if (start >= size || end < start) return 'unsatisfiable';
  return { start, end };
}

/** The conversation's view of a received file: its state and, once stored, where to get it. */
export function withFile(
  display: InboundDisplay,
  leadId: string,
  messageId: string,
  files: Map<string, Omit<InboundMediaRow, 'bytes'>>,
): InboundDisplay {
  const file = files.get(messageId);
  if (!file) return display;
  return {
    ...display,
    media: {
      status: file.status,
      url: file.status === 'stored' ? `/api/conversations/${leadId}/media/${messageId}` : null,
      mime: file.mime,
      size: file.size,
      fileName: file.fileName,
    },
  };
}
