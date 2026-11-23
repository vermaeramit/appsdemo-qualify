import type { InboundDisplay } from '@qualify/shared';
import {
  CircleAlert,
  FileText,
  Image as ImageIcon,
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

/**
 * What an incoming non-text message was (D-099): a photo with its caption, a voice message, a
 * location… or a message WhatsApp didn't pass on, with Meta's error and the usual reasons.
 * Phase 1 shows only what arrived; the files themselves aren't downloaded yet.
 */
export function InboundContent({ display }: { display: InboundDisplay }) {
  const Icon = ICONS[display.kind];
  const unsupported = display.kind === 'unsupported';
  return (
    <div className={cn('space-y-1', unsupported && 'text-grade-warm')}>
      <p className="flex items-start gap-1.5 font-medium">
        <Icon className="mt-0.5 size-4 shrink-0" />
        <span className="break-words">{display.label}</span>
      </p>
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
