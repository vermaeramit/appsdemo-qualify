import { type QueryClient, queryOptions } from '@tanstack/react-query';
import { type MeResponse, meResponseSchema } from '@qualify/shared';
import { ApiError, fetchJson } from './api';

/** The signed-in user and workspaces. Resolves to null when there is no session (401). */
export const meQueryOptions = queryOptions({
  queryKey: ['me'] as const,
  queryFn: async (): Promise<MeResponse | null> => {
    try {
      return await fetchJson('/api/me', meResponseSchema);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  staleTime: 60_000,
});

/**
 * After the session moved to another workspace (support access, D-092): drop every cached page
 * of the previous one, then reload the user so the mounted shell shows the new workspace.
 */
export async function afterWorkspaceSwitch(queryClient: QueryClient): Promise<void> {
  queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' });
  await queryClient.invalidateQueries({ queryKey: meQueryOptions.queryKey });
}

/** Only allow same-site relative paths as post-login redirects (prevents open redirects). */
export function safeRedirect(target: string | undefined): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) {
    return '/dashboard';
  }
  return target;
}
