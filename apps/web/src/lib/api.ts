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
