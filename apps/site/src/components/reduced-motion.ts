import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/**
 * The visitor's reduced-motion setting, safe for pre-rendered pages: false while hydrating (as on
 * the server, which cannot know it), then the real value. Motion's own hook returns the real value
 * on the first render, so markup that depends on it no longer matches the pre-rendered HTML.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
