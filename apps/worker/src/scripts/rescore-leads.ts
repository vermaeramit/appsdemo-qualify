// Recomputes every lead's score with the workspace's current scoring (also happens on publish).
//   pnpm --filter @qualify/worker rescore-leads [workspace-slug]
import '../load-env.ts';
import { createDb, organization } from '@qualify/db';
import { rescoreTenantLeads } from '../agent/rescore.ts';

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('✗ APP_DATABASE_URL is not set');
  process.exit(1);
}
const { db, pool } = createDb(url, { max: 1 });

try {
  const [slug] = process.argv.slice(2);
  const workspaces = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization);
  const workspace = slug
    ? workspaces.find((candidate) => candidate.slug === slug)
    : workspaces.length === 1
      ? workspaces[0]
      : undefined;
  if (!workspace) {
    console.error(
      `✗ Pass the workspace slug. Available: ${workspaces.map((w) => w.slug).join(', ')}`,
    );
    process.exit(1);
  }

  const counts = await rescoreTenantLeads(db, workspace.id);
  console.log(`✓ Rescored ${counts.total} leads in "${workspace.name}":`, counts.grades);
} finally {
  await pool.end();
}
