import { useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ArrowLeft, Loader2, MessageCircleDashed } from 'lucide-react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationList } from '@/features/conversations/conversation-list';
import { AddLeadDialog } from '@/features/leads/add-lead-dialog';
import { MessageThread } from '@/features/conversations/message-thread';
import { conversationsQueryOptions, threadQueryOptions } from '@/features/conversations/queries';
import { useActiveWorkspace } from '@/lib/use-workspace';
import { cn } from '@/lib/utils';
import { canManage } from '@/lib/workspace';

export const Route = createFileRoute('/_app/conversations')({
  validateSearch: z.object({ lead: z.uuid().optional() }),
  component: ConversationsPage,
});

function ConversationsPage() {
  const { lead: selectedId } = Route.useSearch();
  const workspace = useActiveWorkspace();
  const list = useInfiniteQuery(conversationsQueryOptions);
  const thread = useInfiniteQuery({
    ...threadQueryOptions(selectedId ?? ''),
    enabled: Boolean(selectedId),
  });
  // A lead whose activity changed between two page loads can show up twice: keep the first.
  const conversations = useMemo(() => {
    const seen = new Set<string>();
    return (list.data?.pages ?? [])
      .flatMap((page) => page.conversations)
      .filter((item) => !seen.has(item.leadId) && Boolean(seen.add(item.leadId)));
  }, [list.data]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Conversations</h1>
          <p className="text-sm text-muted-foreground">
            WhatsApp messages on your connected number. Updates every few seconds.
          </p>
        </div>
        {canManage(workspace) && <AddLeadDialog />}
      </div>

      <div className="grid h-[calc(100svh-12rem)] min-h-[420px] overflow-hidden rounded-xl border bg-card md:grid-cols-[320px_1fr]">
        <aside className={cn('overflow-y-auto border-r', selectedId && 'hidden md:block')}>
          {list.isPending ? (
            <ListSkeleton />
          ) : list.isError ? (
            <p className="p-4 text-sm text-destructive">Could not load conversations.</p>
          ) : conversations.length === 0 ? (
            <EmptyInbox />
          ) : (
            <>
              <ConversationList conversations={conversations} selectedId={selectedId} />
              {list.hasNextPage && (
                <div className="border-t p-3 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={list.isFetchingNextPage}
                    onClick={() => void list.fetchNextPage()}
                  >
                    {list.isFetchingNextPage && (
                      <Loader2 className="animate-spin" data-icon="inline-start" />
                    )}
                    Load more
                  </Button>
                </div>
              )}
            </>
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
                <MessageThread
                  pages={thread.data.pages}
                  hasOlder={thread.hasNextPage}
                  loadingOlder={thread.isFetchingNextPage}
                  onLoadOlder={() => void thread.fetchNextPage()}
                />
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
