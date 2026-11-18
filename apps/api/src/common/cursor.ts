import { BadRequestException } from '@nestjs/common';

/**
 * Opaque keyset cursor: the sort key of the last row and its id, encoded so clients treat it as
 * a token. Timestamps are kept as Postgres text so no microseconds are lost.
 */
export function encodeCursor(sortKey: string, id: string): string {
  return Buffer.from(JSON.stringify([sortKey, id])).toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INTEGER = /^-?\d{1,9}$/;

/** What the sort key must look like: a timestamp (default) or an integer (e.g. a score). */
export type CursorKind = 'timestamp' | 'integer';

const validKey: Record<CursorKind, (key: string) => boolean> = {
  timestamp: (key) => !INTEGER.test(key) && !Number.isNaN(Date.parse(key)),
  integer: (key) => INTEGER.test(key),
};

export function decodeCursor(
  cursor: string | undefined,
  kind: CursorKind = 'timestamp',
): { sortKey: string; id: string } | null {
  if (!cursor) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      validKey[kind](value[0]) &&
      typeof value[1] === 'string' &&
      UUID.test(value[1])
    ) {
      return { sortKey: value[0], id: value[1] };
    }
  } catch {
    // Fall through to the error below.
  }
  throw new BadRequestException('Invalid cursor');
}
