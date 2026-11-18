import type { MeResponse } from '@qualify/shared';
import { useSuspenseQuery } from '@tanstack/react-query';
import { meQueryOptions } from './session';

export type ActiveWorkspace = NonNullable<MeResponse['activeWorkspace']>;

/** The active workspace inside the signed-in layout (`/_app` guarantees there is one). */
export function useActiveWorkspace(): ActiveWorkspace {
  const { data } = useSuspenseQuery(meQueryOptions);
  if (!data?.activeWorkspace) throw new Error('No active workspace');
  return data.activeWorkspace;
}
