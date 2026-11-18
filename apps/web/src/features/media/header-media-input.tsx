import { useState } from 'react';
import { MEDIA_MIMES, type TemplateHeaderMedia } from '@qualify/shared';
import { FileText, ImagePlus, Loader2, Trash2, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { uploadMediaFile } from './upload';

/** What the lead sees above the text: the image, a video, or the document's name. */
export function HeaderMediaView({ media }: { media: TemplateHeaderMedia }) {
  const url = `/api/media/${media.assetId}`;
  if (media.kind === 'IMAGE') {
    return <img src={url} alt="" className="max-h-48 w-full rounded-md object-cover" />;
  }
  if (media.kind === 'VIDEO') {
    return (
      <video src={url} className="max-h-48 w-full rounded-md" muted controls preload="metadata" />
    );
  }
  return (
    <span className="flex items-center gap-2 rounded-md bg-muted px-2 py-1.5 text-xs">
      <FileText className="size-4 shrink-0" />
      <span className="truncate">{media.fileName ?? 'Document.pdf'}</span>
    </span>
  );
}

/** Pick, replace or remove the image / video / PDF shown above a template's text. */
export function HeaderMediaInput({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: TemplateHeaderMedia | undefined;
  onChange: (next: TemplateHeaderMedia | undefined) => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      const asset = await uploadMediaFile(file);
      onChange({
        kind: asset.kind,
        assetId: asset.id,
        ...(asset.kind === 'DOCUMENT' ? { fileName: asset.fileName } : {}),
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {value && (
        <div className="max-w-xs">
          <HeaderMediaView media={value} />
        </div>
      )}
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild disabled={busy}>
            <label htmlFor={id} className="cursor-pointer">
              {busy ? (
                <Loader2 className="animate-spin" data-icon="inline-start" />
              ) : value?.kind === 'VIDEO' ? (
                <Video data-icon="inline-start" />
              ) : (
                <ImagePlus data-icon="inline-start" />
              )}
              {value ? 'Replace file' : 'Add image, video or PDF'}
              <input
                id={id}
                type="file"
                accept={MEDIA_MIMES.join(',')}
                className="sr-only"
                onChange={(event) => {
                  void pick(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </label>
          </Button>
          {value && (
            <Button variant="ghost" size="sm" onClick={() => onChange(undefined)}>
              <Trash2 data-icon="inline-start" />
              Remove
            </Button>
          )}
          <span className="text-xs text-muted-foreground">
            JPEG/PNG up to 5 MB, MP4 or PDF up to 16 MB
          </span>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
