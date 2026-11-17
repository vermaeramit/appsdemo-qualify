// Installs the travel playbook template as the default playbook of an existing workspace.
//   pnpm --filter @qualify/worker install-playbook [workspace-slug] ["Business name"]
// New workspaces get it automatically on creation; this is for workspaces created earlier.
import '../load-env.ts';
import { TRAVEL_TEMPLATE_KEY, travelPlaybookTemplate } from '@qualify/core';
import { createDb, createPublishedPlaybook, organization, withTenant } from '@qualify/db';

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('✗ APP_DATABASE_URL is not set');
  process.exit(1);
}
const { db, pool } = createDb(url, { max: 1 });

try {
  const [slug, businessName] = process.argv.slice(2);
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
    createPublishedPlaybook(tx, {
      tenantId: workspace.id,
      name: 'Travel packages',
      templateKey: TRAVEL_TEMPLATE_KEY,
      config: travelPlaybookTemplate(businessName ?? workspace.name),
      isDefault: true,
    }),
  );
  console.log(
    created
      ? `✓ Installed "Travel packages" (v1, published) as the default playbook of "${workspace.name}"`
      : `• "${workspace.name}" already has a default playbook, nothing changed`,
  );
} finally {
  await pool.end();
}
