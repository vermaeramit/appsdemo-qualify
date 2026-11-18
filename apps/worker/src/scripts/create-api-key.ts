// Creates a workspace API key for the inbound lead API / playbook API (e.g. for Postman).
//   pnpm --filter @qualify/worker create-api-key [workspace-slug] ["Key name"]
// The key is printed ONCE; only its SHA-256 hash is stored.
import '../load-env.ts';
import { createApiKey, createDb, organization, withTenant } from '@qualify/db';

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('✗ APP_DATABASE_URL is not set');
  process.exit(1);
}
const { db, pool } = createDb(url, { max: 1 });

try {
  const [slug, name] = process.argv.slice(2);
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
  const created = await withTenant(db, workspace.id, (tx) =>
    createApiKey(tx, { tenantId: workspace.id, name: name ?? 'Postman', createdBy: null }),
  );
  console.log(
    `✓ API key for "${workspace.name}" (${name ?? 'Postman'}). Copy it now, it is not shown again:\n`,
  );
  console.log(`  ${created.key}\n`);
  console.log('Use it as:  Authorization: Bearer <key>   (or header  X-API-Key: <key>)');
} finally {
  await pool.end();
}
