interface AuthClientError {
  status?: number | undefined;
  message?: string | undefined;
}

/** Maps Better Auth client errors to friendly copy. */
export function authErrorMessage(error: AuthClientError, fallback: string): string {
  if (error.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (error.status && error.status >= 500)
    return 'Something went wrong on our side. Please try again.';
  return error.message || fallback;
}
