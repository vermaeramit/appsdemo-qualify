import { Fragment } from 'react';
import type { TemplateHeaderMedia } from '@qualify/shared';
import { WhatsAppBubble } from '@/features/agent/whatsapp-preview';
import { HeaderMediaView } from '@/features/media/header-media-input';

/** Body text with {{n}} shown as the example value (or a highlighted placeholder). */
function Body({ text, examples }: { text: string; examples: readonly string[] }) {
  const parts = text.split(/(\{\{\s*\d+\s*\}\})/g);
  return (
    <>
      {parts.map((part, index) => {
        const match = /\{\{\s*(\d+)\s*\}\}/.exec(part);
        if (!match) return <Fragment key={index}>{part}</Fragment>;
        const example = examples[Number(match[1]) - 1];
        return (
          <span key={index} className="rounded bg-primary/10 px-1 font-medium text-primary">
            {example || part}
          </span>
        );
      })}
    </>
  );
}

/** A template as the lead sees it on WhatsApp. */
export function TemplatePreview({
  headerText,
  headerMedia,
  bodyText,
  footerText,
  buttons,
  examples = [],
}: {
  headerText: string | null | undefined;
  headerMedia?: TemplateHeaderMedia | undefined;
  bodyText: string;
  footerText: string | null | undefined;
  buttons: readonly string[];
  examples?: readonly string[];
}) {
  return (
    <WhatsAppBubble buttons={buttons.filter(Boolean)}>
      {headerMedia && (
        <span className="mb-2 block">
          <HeaderMediaView media={headerMedia} />
        </span>
      )}
      {headerText && <span className="mb-1 block font-semibold">{headerText}</span>}
      <Body text={bodyText || '…'} examples={examples} />
      {footerText && <span className="mt-1 block text-xs text-muted-foreground">{footerText}</span>}
    </WhatsAppBubble>
  );
}
