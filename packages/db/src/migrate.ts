import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.ts';

/** Works from both src/ (dev, tests) and dist/ (production): migrations live in packages/db/drizzle. */
export const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url));

/**
 * Applies pending migrations. Run as the database owner (DATABASE_URL), never as qualify_app.
 */
export async function runMigrations(ownerConnectionString: string): Promise<void> {
  const { db, pool } = createDb(ownerConnectionString, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}
