import { z } from 'zod';

/** Anything with a Zod-style `parse` (every schema exported by @qualify/shared). */
interface Parser<T> {
  parse: (data: unknown) => T;
}

export interface ApiIssue {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly status: number;
  /** Validation issues from a 400 (`path` like "fields.2.options"). */
  readonly issues: ApiIssue[];

  constructor(status: number, message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

const errorBodySchema = z.object({
  message: z.union([z.string(), z.array(z.string())]).optional(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
});

/** Turns a failed response into an ApiError with the server's message when there is one. */
async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `${response.status} ${response.statusText}`;
  try {
    const parsed = errorBodySchema.safeParse(await response.json());
    if (parsed.success) {
      const { message, issues } = parsed.data;
      const text = Array.isArray(message) ? message.join(', ') : message;
      return new ApiError(response.status, text || fallback, issues ?? []);
    }
  } catch {
    // Not JSON: keep the status text.
  }
  return new ApiError(response.status, fallback);
}

/** POST to our same-origin API (the browser adds the Origin header our CSRF guard checks). */
export async function apiPost(url: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!response.ok) throw await toApiError(response);
}

/** POST/PUT/PATCH JSON and validate the response against a shared schema. */
export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'PATCH',
  url: string,
  body: unknown,
  schema: Parser<T>,
): Promise<T> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}

/** DELETE a resource (204 expected). */
export async function apiDelete(url: string): Promise<void> {
  const response = await fetch(url, { method: 'DELETE', credentials: 'same-origin' });
  if (!response.ok) throw await toApiError(response);
}

/** Fetch JSON from our same-origin API and validate it against a shared schema. */
export async function fetchJson<T>(url: string, schema: Parser<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await toApiError(response);
  return schema.parse(await response.json());
}

/** A readable message for a toast. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.status !== 500 && error.message) return error.message;
  return fallback;
}
