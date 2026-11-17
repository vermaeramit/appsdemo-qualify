/** Anything with a Zod-style `parse` (every schema exported by @qualify/shared). */
interface Parser<T> {
  parse: (data: unknown) => T;
}

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** POST to our same-origin API (the browser adds the Origin header our CSRF guard checks). */
export async function apiPost(url: string, body?: unknown): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'same-origin',
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? null : JSON.stringify(body),
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${response.status} ${response.statusText}`);
  }
}

/** Fetch JSON from our same-origin API and validate it against a shared schema. */
export async function fetchJson<T>(url: string, schema: Parser<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new ApiError(response.status, `${response.status} ${response.statusText}`);
  }
  return schema.parse(await response.json());
}
