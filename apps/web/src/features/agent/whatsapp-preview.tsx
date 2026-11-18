import type { ReactNode } from 'react';
import { chooseReplyOptions } from '@qualify/core';
import type { PlaybookField } from '@qualify/shared';
import { List, Reply } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A WhatsApp-style message bubble with optional reply buttons or a list button. */
export function WhatsAppBubble({
  children,
  buttons = [],
  listLabel,
  className,
}: {
  children: ReactNode;
  buttons?: readonly string[];
  listLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn('w-full max-w-xs space-y-1', className)}>
      <div className="rounded-xl rounded-tl-sm bg-card px-3 py-2 text-sm whitespace-pre-wrap shadow-sm ring-1 ring-border">
        {children}
      </div>
      {listLabel && (
        <div className="flex items-center justify-center gap-1.5 rounded-xl bg-card px-3 py-2 text-sm font-medium text-sky-600 shadow-sm ring-1 ring-border dark:text-sky-400">
          <List className="size-4" />
          {listLabel}
        </div>
      )}
      {buttons.map((button) => (
        <div
          key={button}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-card px-3 py-2 text-sm font-medium text-sky-600 shadow-sm ring-1 ring-border dark:text-sky-400"
        >
          <Reply className="size-3.5" />
          {button}
        </div>
      ))}
    </div>
  );
}

/** How the agent will ask this question on WhatsApp (same rules as the worker). */
export function QuestionPreview({ field }: { field: PlaybookField }) {
  const options = chooseReplyOptions({
    definitions: [field],
    askingField: field.key,
    status: 'engaged',
    language: 'en',
    suggested: [],
  });
  const text = field.question?.trim() || field.label.trim() || 'Your question';

  return (
    <div className="space-y-2 rounded-lg bg-muted/60 p-3">
      <WhatsAppBubble
        buttons={options.kind === 'buttons' ? options.buttons : []}
        {...(options.kind === 'list' ? { listLabel: options.buttonLabel } : {})}
      >
        {text}
      </WhatsAppBubble>
      {options.kind === 'list' && (
        <ul className="ml-2 space-y-0.5 text-xs text-muted-foreground">
          {options.rows.map((row) => (
            <li key={row}>○ {row}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">{describe(field, options.kind)}</p>
    </div>
  );
}

function describe(field: PlaybookField, kind: 'none' | 'buttons' | 'list'): string {
  if (field.type === 'yes_no') return 'Yes / No buttons, in the lead’s language.';
  if (field.type === 'choice') {
    if (kind === 'buttons') return 'Up to 3 short options are shown as reply buttons.';
    if (kind === 'list') return '4–10 options (or longer than 20 characters) open a list menu.';
    return 'Add at least 2 options.';
  }
  return 'The lead types the answer. The AI may suggest quick replies.';
}
