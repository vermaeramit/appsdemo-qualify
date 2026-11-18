import { createContext, useContext } from 'react';
import { queryOptions } from '@tanstack/react-query';
import {
  agentListSchema,
  openingTemplateStatusSchema,
  playbookResponseSchema,
  routeOptionsSchema,
} from '@qualify/shared';
import { fetchJson } from '@/lib/api';

/** The agent being edited on the AI agent page (undefined = the default agent; D-086). */
export const AgentIdContext = createContext<string | undefined>(undefined);
export const useAgentId = () => useContext(AgentIdContext);

/** "?agent=<id>" for the playbook endpoints, or nothing for the default agent. */
export const agentQuery = (agentId: string | undefined, prefix: '?' | '&' = '?') =>
  agentId ? `${prefix}agent=${encodeURIComponent(agentId)}` : '';

/** The default agent's configuration (Add lead, API docs). */
export const playbookQueryOptions = queryOptions({
  queryKey: ['playbook'] as const,
  queryFn: () => fetchJson('/api/playbook', playbookResponseSchema),
  staleTime: 30_000,
});

/** One agent's configuration (the AI agent page). */
export const agentPlaybookQueryOptions = (agentId: string | undefined) =>
  queryOptions({
    queryKey: ['playbook', 'agent', agentId ?? 'default'] as const,
    queryFn: () => fetchJson(`/api/playbook${agentQuery(agentId)}`, playbookResponseSchema),
    staleTime: 30_000,
  });

export const agentsQueryOptions = queryOptions({
  queryKey: ['agents'] as const,
  queryFn: () => fetchJson('/api/agents', agentListSchema),
  staleTime: 30_000,
});

export const routeOptionsQueryOptions = queryOptions({
  queryKey: ['agents', 'route-options'] as const,
  queryFn: () => fetchJson('/api/agents/route-options', routeOptionsSchema),
});

/** Asks Meta for the review state; re-checks every minute while a review is pending. */
export const templateQueryOptions = (kind: 'opening' | 'followup', agentId?: string) =>
  queryOptions({
    queryKey: ['playbook', 'template', kind, agentId ?? 'default'] as const,
    queryFn: () =>
      fetchJson(
        `/api/playbook/templates/${kind}${agentQuery(agentId)}`,
        openingTemplateStatusSchema,
      ),
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? 60_000 : false),
  });

export const openingTemplateQueryOptions = templateQueryOptions('opening');
