import {
  INBOUND_MEDIA_MAX_BYTES,
  INBOUND_MEDIA_RETENTION_DAYS,
  type InboundDisplay,
} from '@qualify/shared';
import {
  CircleAlert,
  Download,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  type LucideIcon,
  MapPin,
  MessageSquare,
  Mic,
  Music,
  ShoppingCart,
  SmilePlus,
  Sticker,
  UserRound,
  Video,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatFileSize } from '@/lib/file-size';
import { cn } from '@/lib/utils';

const ICONS: Record<InboundDisplay['kind'], LucideIcon> = {
  image: ImageIcon,
  video: Video,
  voice: Mic,
  audio: Music,
  document: FileText,
  sticker: Sticker,
  location: MapPin,
  contacts: UserRound,
  reaction: SmilePlus,
  order: ShoppingCart,
  unsupported: CircleAlert,
  other: MessageSquare,
};

type InboundMedia = NonNullable<InboundDisplay['media']>;

/** Why a file isn't shown, for each state but "stored". */
const FILE_NOTES: Record<Exclude<InboundMedia['status'], 'stored'>, string> = {
  pending: 'Downloading from WhatsApp…',
  too_large: `Larger than ${INBOUND_MEDIA_MAX_BYTES / 1024 / 1024} MB, so it isn't kept. Open it on the phone.`,
  failed: "Couldn't be downloaded from WhatsApp. Ask the lead to send it again.",
  expired: `Removed ${INBOUND_MEDIA_RETENTION_DAYS} days after it arrived.`,
};

/**
 * What an incoming non-text message was (D-099), and the file itself once the worker has
 * downloaded it (D-100): the photo or sticker, a video or voice note to play, a document to
 * open or download. A message WhatsApp didn't pass on shows Meta's error and the usual reasons.
 */
export function InboundContent({ display }: { display: InboundDisplay }) {
  const Icon = ICONS[display.kind];
  const unsupported = display.kind === 'unsupported';
  const media = display.media;
  const stored = media?.status === 'stored' && media.url ? media.url : null;
  // A shown photo, sticker, video or document card speaks for itself; a voice note keeps its label.
  const visual = stored && display.kind !== 'voice' && display.kind !== 'audio';
  return (
    <div className={cn('space-y-1.5', unsupported && 'text-grade-warm')}>
      {!visual && (
        <p className="flex items-start gap-1.5 font-medium">
          <Icon className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{display.label}</span>
        </p>
      )}
      {stored && media && (
        <StoredFile kind={display.kind} label={display.label} url={stored} media={media} />
      )}
      {media && media.status !== 'stored' && (
        <p
          className={cn(
            'flex items-center gap-1.5 text-xs text-muted-foreground',
            media.status === 'failed' && 'text-grade-warm',
          )}
        >
          {media.status === 'pending' && <Loader2 className="size-3 animate-spin" />}
          {FILE_NOTES[media.status]}
        </p>
      )}
      {display.detail && (
        <p className="break-words whitespace-pre-wrap text-foreground/80">{display.detail}</p>
      )}
      {unsupported && (
        <p className="text-xs text-muted-foreground">
          WhatsApp passes only some message types to the API.
          {display.metaError ? ` Meta: ${display.metaError}` : ''} It may have been a view-once
          photo or video, a poll, an event, or a message from a chat with disappearing messages. Ask
          the lead to send it again as a normal message.
        </p>
      )}
    </div>
  );
}

function StoredFile({
  kind,
  label,
  url,
  media,
}: {
  kind: InboundDisplay['kind'];
  label: string;
  url: string;
  media: InboundMedia;
}) {
  const downloadUrl = `${url}?download=1`;
  if (kind === 'image' || kind === 'sticker') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        title="Open full size"
      >
        <img
          src={url}
          alt={label}
          loading="lazy"
          className={cn(
            'w-auto max-w-full rounded-lg object-contain',
            kind === 'sticker' ? 'max-h-32' : 'max-h-72 bg-muted',
          )}
        />
      </a>
    );
  }
  if (kind === 'video') {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        className="max-h-72 w-full max-w-sm rounded-lg bg-black"
        aria-label={label}
      />
    );
  }
  if (kind === 'voice' || kind === 'audio') {
    return (
      <div className="space-y-1">
        <audio
          src={url}
          controls
          preload="metadata"
          className="h-10 w-64 max-w-full"
          aria-label={label}
        />
        <FileActions downloadUrl={downloadUrl} size={media.size} />
      </div>
    );
  }
  // A document (or anything else with a file): open it in a new tab where the browser can, or download.
  const opens = media.mime?.split(';')[0]?.trim() === 'application/pdf';
  return (
    <div className="flex min-w-56 flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2">
      <FileText className="size-5 shrink-0 text-muted-foreground" />
      <div className="min-w-28 flex-1">
        <p className="text-xs font-medium break-words">{media.fileName ?? label}</p>
        {media.size !== null && (
          <p className="text-[0.7rem] text-muted-foreground">{formatFileSize(media.size)}</p>
        )}
      </div>
      <div className="flex gap-1">
        {opens && (
          <Button asChild variant="outline" size="xs">
            <a href={url} target="_blank" rel="noopener noreferrer">
              <ExternalLink data-icon="inline-start" />
              Open
            </a>
          </Button>
        )}
        <Button asChild variant="outline" size="xs">
          <a href={downloadUrl} download={media.fileName ?? true}>
            <Download data-icon="inline-start" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
}

function FileActions({ downloadUrl, size }: { downloadUrl: string; size: number | null }) {
  return (
    <p className="flex items-center gap-2 text-[0.7rem] text-muted-foreground">
      <a href={downloadUrl} download className="inline-flex items-center gap-1 hover:underline">
        <Download className="size-3" />
        Download
      </a>
      {size !== null && <span>{formatFileSize(size)}</span>}
    </p>
  );
}
