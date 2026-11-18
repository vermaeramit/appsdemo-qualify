import { MEDIA_TYPES, type MediaAsset, mediaAssetSchema, type MediaMime } from '@qualify/shared';
import { ApiError } from '@/lib/api';

/** Uploads a header file (image, video, PDF) after checking type and size in the browser. */
export async function uploadMediaFile(file: File): Promise<MediaAsset> {
  const type = MEDIA_TYPES[file.type as MediaMime];
  if (!type) throw new Error('Choose a JPEG or PNG image, an MP4 video or a PDF.');
  if (file.size > type.maxBytes) {
    throw new Error(`${type.label} files can be at most ${type.maxBytes / 1024 / 1024} MB.`);
  }
  const response = await fetch(`/api/media?fileName=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': file.type },
    body: file,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new ApiError(response.status, body.message ?? 'Upload failed', []);
  }
  return mediaAssetSchema.parse(await response.json());
}
