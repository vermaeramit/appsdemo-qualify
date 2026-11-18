import { BadRequestException } from '@nestjs/common';

/**
 * Opaque keyset cursor: the sort key of the last row (a Postgres timestamp, kept as text so no
 * microseconds are lost) and its id. Encoded so clients treat it as a token.
 */
export function encodeCursor(sortKey: string, id: string): string {
  return Buffer.from(JSON.stringify([sortKey, id])).toString('base64url');
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(cursor: string | undefined): { sortKey: string; id: string } | null {
  if (!cursor) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      !Number.isNaN(Date.parse(value[0])) &&
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
