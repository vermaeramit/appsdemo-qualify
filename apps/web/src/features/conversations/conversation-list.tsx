import type { ConversationSummary } from '@qualify/shared';
import { Link } from '@tanstack/react-router';
import { Phone } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/time';
import { initials } from '@/lib/workspace';

export function ConversationList({
  conversations,
  selectedId,
}: {
  conversations: ConversationSummary[];
  selectedId: string | undefined;
}) {
  return (
    <ul className="divide-y">
      {conversations.map((conversation, index) => {
        const label = conversation.name ?? conversation.phone;
        const active = conversation.leadId === selectedId;
        return (
          <motion.li
            key={conversation.leadId}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: Math.min(index, 10) * 0.03 }}
          >
            <Link
              to="/conversations"
              search={{ lead: conversation.leadId }}
              className={cn(
                'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/60',
                active && 'bg-accent hover:bg-accent',
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {conversation.name ? initials(conversation.name) : <Phone className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">{label}</span>
                  {conversation.lastMessageAt && (
                    <span className="shrink-0 text-[0.7rem] text-muted-foreground">
                      {timeAgo(conversation.lastMessageAt)}
                    </span>
                  )}
                </span>
                {conversation.name && (
                  <span className="block text-xs text-muted-foreground">{conversation.phone}</span>
                )}
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {conversation.lastMessage ??
                    (conversation.messageCount === 0 ? 'No messages yet' : 'Media message')}
                </span>
              </span>
            </Link>
          </motion.li>
        );
      })}
    </ul>
  );
}
