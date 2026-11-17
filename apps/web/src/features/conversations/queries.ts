import { queryOptions } from '@tanstack/react-query';
import { conversationListSchema, conversationThreadSchema } from '@qualify/shared';
import { fetchJson } from '@/lib/api';

// Polling keeps the inbox fresh until live updates (Socket.IO) arrive in M5.

export const conversationsQueryOptions = queryOptions({
  queryKey: ['conversations'] as const,
  queryFn: () => fetchJson('/api/conversations', conversationListSchema),
  refetchInterval: 4_000,
});

export const threadQueryOptions = (leadId: string) =>
  queryOptions({
    queryKey: ['conversations', leadId] as const,
    queryFn: () => fetchJson(`/api/conversations/${leadId}`, conversationThreadSchema),
    refetchInterval: 3_000,
  });
