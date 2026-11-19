import { Logger } from '@nestjs/common';
import { type Database, eq, recordActivity, user } from '@qualify/db';
import type { ActivityInput } from '@qualify/shared';

const logger = new Logger('Activity');

/** Writes activity entries from the api (D-091). Never throws: a lost log line is only warned. */
export async function recordApiActivity(
  db: Database,
  entries: ActivityInput | readonly ActivityInput[],
): Promise<void> {
  const error = await recordActivity(db, entries);
  if (error) logger.warn(`Activity log write failed: ${String(error)}`);
}

/** The teammate's name for "Asha paused the AI" (falls back to a neutral word). */
export async function actorName(db: Database, userId: string): Promise<string> {
  const [row] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
    .catch(() => []);
  return row?.name?.trim() || 'A teammate';
}
