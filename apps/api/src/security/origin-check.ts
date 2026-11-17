const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated requests: a state-changing request must come from
 * our own dashboard origin. Browsers always send `Origin` on cross-site POST/PUT/PATCH/DELETE,
 * so a missing or foreign origin is rejected. Server-to-server API keys (M7) bypass this guard.
 */
export function isAllowedOrigin(
  method: string,
  headers: { origin?: string | undefined; referer?: string | undefined },
  allowedOrigin: string,
): boolean {
  if (SAFE_METHODS.has(method.toUpperCase())) return true;
  const source = headers.origin ?? headers.referer;
  if (!source) return false;
  try {
    return new URL(source).origin === new URL(allowedOrigin).origin;
  } catch {
    return false;
  }
}
