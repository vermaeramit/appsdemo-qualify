import type { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { FullPageLoader } from '@/components/full-page-loader';
import { routeTree } from './routeTree.gen';

export function createAppRouter(queryClient: QueryClient) {
  return createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    // Data freshness is handled by TanStack Query, not the router cache.
    defaultPreloadStaleTime: 0,
    defaultPendingComponent: FullPageLoader,
    defaultPendingMs: 150,
    scrollRestoration: true,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
