// Installs the travel playbook template as the default playbook of an existing workspace.
//   pnpm --filter @qualify/worker install-playbook [workspace-slug] ["Business name"] [--upgrade]
// New workspaces get it automatically on creation; this is for workspaces created earlier.
// --upgrade publishes the latest template as a new version of the existing default playbook
// (keeps an approved opening template name if one is active).
import '../load-env.ts';
import { TRAVEL_TEMPLATE_KEY, travelPlaybookTemplate } from '@qualify/core';
import {
  createDb,
  createPublishedPlaybook,
  getDefaultPublishedPlaybook,
  organization,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('✗ APP_DATABASE_URL is not set');
  process.exit(1);
}
const { db, pool } = createDb(url, { max: 1 });

try {
  const args = process.argv.slice(2);
  const upgrade = args.includes('--upgrade');
  const [slug, businessName] = args.filter((arg) => !arg.startsWith('--'));
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

  const message = await withTenant(db, workspace.id, async (tx) => {
    const current = await getDefaultPublishedPlaybook(tx);
    if (!current) {
      await createPublishedPlaybook(tx, {
        tenantId: workspace.id,
        name: 'Travel packages',
        templateKey: TRAVEL_TEMPLATE_KEY,
        config: travelPlaybookTemplate(businessName ?? workspace.name),
        isDefault: true,
      });
      return `✓ Installed "Travel packages" (v1) as the default playbook of "${workspace.name}"`;
    }
    if (!upgrade) {
      return `• "${workspace.name}" already has a default playbook (v${current.versionNo}). Use --upgrade to publish the latest template.`;
    }
    const template = travelPlaybookTemplate(businessName ?? current.config.business.name);
    const activeTemplate = current.config.opening?.templateName ?? null;
    const next = await publishPlaybookVersion(tx, {
      tenantId: workspace.id,
      playbookId: current.playbookId,
      config: {
        ...template,
        opening: { ...template.opening!, templateName: activeTemplate },
      },
    });
    return `✓ Published the latest travel template as v${next.versionNo} of "${workspace.name}"'s playbook`;
  });
  console.log(message);
} finally {
  await pool.end();
}
