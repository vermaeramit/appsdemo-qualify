// pnpm --filter @qualify/db db:migrate  (uses DATABASE_URL = database owner)
import { runMigrations } from '../migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set (owner connection used for migrations).');
  process.exit(1);
}

await runMigrations(url);
console.log('Migrations applied.');
