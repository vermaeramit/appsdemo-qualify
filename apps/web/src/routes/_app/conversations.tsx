import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, MessageCircleDashed } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationList } from '@/features/conversations/conversation-list';
import { MessageThread } from '@/features/conversations/message-thread';
import { conversationsQueryOptions, threadQueryOptions } from '@/features/conversations/queries';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/_app/conversations')({
  validateSearch: z.object({ lead: z.uuid().optional() }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const { lead: selectedId } = Route.useSearch();
  const list = useQuery(conversationsQueryOptions);
  const thread = useQuery({
    ...threadQueryOptions(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
        <p className="text-sm text-muted-foreground">
          WhatsApp messages on your connected number. Updates every few seconds.
        </p>
      </div>

      <div className="grid h-[calc(100svh-12rem)] min-h-[420px] overflow-hidden rounded-xl border bg-card md:grid-cols-[320px_1fr]">
        <aside className={cn('overflow-y-auto border-r', selectedId && 'hidden md:block')}>
          {list.isPending ? (
            <ListSkeleton />
          ) : list.isError ? (
            <p className="p-4 text-sm text-destructive">Could not load conversations.</p>
          ) : list.data.conversations.length === 0 ? (
            <EmptyInbox />
          ) : (
            <ConversationList conversations={list.data.conversations} selectedId={selectedId} />
          )}
        </aside>

        <section className={cn('min-h-0', !selectedId && 'hidden md:block')}>
          {!selectedId ? (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
              Select a conversation to read it.
            </div>
          ) : thread.isPending ? (
            <div className="space-y-3 p-4">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-12 w-2/3" />
              <Skeleton className="ml-auto h-12 w-1/2" />
            </div>
          ) : thread.isError ? (
            <p className="p-4 text-sm text-destructive">Could not load this conversation.</p>
          ) : (
            <div className="flex h-full flex-col">
              <div className="border-b p-2 md:hidden">
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/conversations" search={{}}>
                    <ArrowLeft data-icon="inline-start" />
                    All conversations
                  </Link>
                </Button>
              </div>
              <div className="min-h-0 flex-1">
                <MessageThread thread={thread.data} />
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4 p-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-40" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyInbox() {
  return (
    <div className="grid h-full place-items-center p-6 text-center">
      <div className="space-y-2">
        <MessageCircleDashed className="mx-auto size-8 text-muted-foreground" />
        <p className="text-sm font-medium">No conversations yet</p>
        <p className="text-xs text-muted-foreground">
          Send a WhatsApp message to your connected number and it will show up here.
        </p>
      </div>
    </div>
  );
}
