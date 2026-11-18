import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { ConversationMessage, ConversationThread } from '@qualify/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bot,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  Loader2,
  Pause,
  Play,
  UserRound,
} from 'lucide-react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { apiPost } from '@/lib/api';
import { cn } from '@/lib/utils';
import { clockTime } from '@/lib/time';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { canManage } from '@/lib/workspace';
import { DeleteLeadButton } from './delete-lead';
import { LeadPanel } from './lead-panel';
import { LeadStatusBadge } from './lead-status';

/** The latest page first, then older ones. Shows them oldest first. */
export function MessageThread({
  pages,
  hasOlder,
  loadingOlder,
  onLoadOlder,
}: {
  pages: ConversationThread[];
  hasOlder: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}) {
  const thread = pages[0]!;
  const manager = canManage(useActiveWorkspace().role);
  const messages = useMemo(() => {
    const seen = new Set<string>();
    return pages
      .toReversed()
      .flatMap((page) => page.messages)
      .filter((message) => !seen.has(message.id) && Boolean(seen.add(message.id)));
  }, [pages]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const heightBefore = useRef<number | null>(null);
  const lastId = messages.at(-1)?.id;
  const firstId = messages[0]?.id;

  // Keep the newest message in view when one arrives.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [lastId]);

  // Older messages are added above: keep what the reader was looking at in place.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (box && heightBefore.current !== null) {
      box.scrollTop += box.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    }
  }, [firstId]);

  const loadOlder = () => {
    heightBefore.current = scrollRef.current?.scrollHeight ?? null;
    onLoadOlder();
  };

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {thread.lead.name ?? thread.lead.phone}
              </span>
              <LeadStatusBadge status={thread.lead.status} />
            </div>
            <div className="text-xs text-muted-foreground">
              {thread.lead.name ? `${thread.lead.phone} · ` : ''}WhatsApp
            </div>
          </div>
          {manager && (
            <DeleteLeadButton
              leadId={thread.lead.id}
              label={thread.lead.name ?? thread.lead.phone}
            />
          )}
          <AiToggle leadId={thread.lead.id} paused={thread.lead.aiPaused} />
        </div>
        <div
          ref={scrollRef}
          className="flex-1 space-y-2 overflow-y-auto bg-muted/30 px-4 py-4 [overflow-anchor:none]"
        >
          {hasOlder && (
            <div className="text-center">
              <Button variant="outline" size="xs" disabled={loadingOlder} onClick={loadOlder}>
                {loadingOlder && <Loader2 className="animate-spin" data-icon="inline-start" />}
                Load older messages
              </Button>
            </div>
          )}
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <aside className="hidden w-64 shrink-0 overflow-y-auto border-l xl:block">
        <LeadPanel lead={thread.lead} />
      </aside>
    </div>
  );
}

/** Pause = a human takes over; Resume = the AI answers the lead's next message. */
function AiToggle({ leadId, paused }: { leadId: string; paused: boolean }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => apiPost(`/api/conversations/${leadId}/${paused ? 'resume' : 'pause'}`),
    onSuccess: async () => {
      toast.success(paused ? 'AI resumed for this lead' : 'AI paused. You are in control.');
      await queryClient.invalidateQueries({ queryKey: ['conversations', leadId] });
    },
    onError: () => toast.error('Could not change the AI status. Please try again.'),
  });

  return (
    <Button
      variant={paused ? 'default' : 'outline'}
      size="sm"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
    >
      {mutation.isPending ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : paused ? (
        <Play data-icon="inline-start" />
      ) : (
        <Pause data-icon="inline-start" />
      )}
      {paused ? 'Resume AI' : 'Pause AI'}
    </Button>
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
        {outbound && (
          <div className="mb-0.5 flex items-center gap-1 text-[0.65rem] font-medium opacity-80">
            {message.sender === 'human_app' ? (
              <UserRound className="size-3" />
            ) : (
              <Bot className="size-3" />
            )}
            {message.sender === 'human_app'
              ? 'Team (WhatsApp app)'
              : message.sender === 'ai'
                ? 'AI agent'
                : message.type === 'template'
                  ? 'Opening (template)'
                  : 'Automated'}
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
        {message.errorMessage && (
          <p className="mt-1.5 flex items-start gap-1 border-t border-primary-foreground/20 pt-1.5 text-[0.7rem] text-primary-foreground/90">
            <CircleAlert className="mt-px size-3 shrink-0" />
            {message.errorMessage}
          </p>
        )}
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
