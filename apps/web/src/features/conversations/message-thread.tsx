import { useEffect, useRef } from 'react';
import type { ConversationMessage, ConversationThread } from '@qualify/shared';
import { Check, CheckCheck, CircleAlert, Clock, Bot } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { clockTime } from '@/lib/time';

export function MessageThread({ thread }: { thread: ConversationThread }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastId = thread.messages.at(-1)?.id;

  // Keep the newest message in view when one arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastId]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="text-sm font-semibold">{thread.lead.name ?? thread.lead.phone}</div>
        <div className="text-xs text-muted-foreground">
          {thread.lead.name ? `${thread.lead.phone} · ` : ''}WhatsApp
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/30 px-4 py-4">
        {thread.messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ConversationMessage }) {
  const outbound = message.direction === 'outbound';
  return (
    <motion.div
      layout="position"
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={cn('flex', outbound ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm',
          outbound
            ? 'rounded-br-md bg-primary text-primary-foreground'
            : 'rounded-bl-md border bg-card text-card-foreground',
        )}
      >
        {outbound && message.sender !== 'human_app' && (
          <div className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-medium opacity-80">
            <Bot className="size-3" />
            {message.sender === 'ai' ? 'AI agent' : 'Dev bot'}
          </div>
        )}
        <p className="break-words whitespace-pre-wrap">
          {message.body ?? <span className="italic opacity-75">[{message.type} message]</span>}
        </p>
        <div
          className={cn(
            'mt-1 flex items-center justify-end gap-1 text-[0.65rem]',
            outbound ? 'text-primary-foreground/75' : 'text-muted-foreground',
          )}
        >
          {clockTime(message.createdAt)}
          {outbound && <StatusIcon status={message.status} />}
        </div>
      </div>
    </motion.div>
  );
}

function StatusIcon({ status }: { status: ConversationMessage['status'] }) {
  switch (status) {
    case 'pending':
      return <Clock className="size-3" aria-label="Pending" />;
    case 'sent':
      return <Check className="size-3" aria-label="Sent" />;
    case 'delivered':
      return <CheckCheck className="size-3" aria-label="Delivered" />;
    case 'read':
      return <CheckCheck className="size-3 text-sky-300" aria-label="Read" />;
    case 'failed':
      return <CircleAlert className="size-3 text-red-200" aria-label="Failed" />;
    default:
      return null;
  }
}
