// Installs or updates a workspace's default playbook from a template.
//   pnpm --filter @qualify/worker install-playbook [workspace-slug] ["Business name"]
//        [--template=<key>] [--upgrade | --fill-missing]
// New workspaces get the template picked at onboarding; this is for earlier workspaces.
//   --template      general (default), travel-packages, real-estate, education, clinic
//   --upgrade       publish the latest template as a new version (keeps approved template names)
//   --fill-missing  keep the current config; add the template's scoring and follow-ups when
//                   missing and append template rules the config doesn't have yet
import '../load-env.ts';
import { findTemplate, PLAYBOOK_TEMPLATES } from '@qualify/core';
import {
  createDb,
  createPublishedPlaybook,
  eq,
  getDefaultPublishedPlaybook,
  organization,
  playbooks,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import { type PlaybookConfig, playbookConfigSchema } from '@qualify/shared';

const MAX_RULES = 30;

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('✗ APP_DATABASE_URL is not set');
  process.exit(1);
}
const { db, pool } = createDb(url, { max: 1 });

try {
  const args = process.argv.slice(2);
  const upgrade = args.includes('--upgrade');
  const fillMissing = args.includes('--fill-missing');
  const templateArg = args.find((arg) => arg.startsWith('--template='))?.split('=')[1];
  if (templateArg && !PLAYBOOK_TEMPLATES.some((template) => template.key === templateArg)) {
    console.error(
      `✗ Unknown template. Use one of: ${PLAYBOOK_TEMPLATES.map((t) => t.key).join(', ')}`,
    );
    process.exit(1);
  }
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
      const template = findTemplate(templateArg);
      await createPublishedPlaybook(tx, {
        tenantId: workspace.id,
        name: template.name,
        templateKey: template.key,
        config: template.build(businessName ?? workspace.name),
        isDefault: true,
      });
      return `✓ Installed "${template.name}" (v1) as the default playbook of "${workspace.name}"`;
    }
    if (!upgrade && !fillMissing) {
      return `• "${workspace.name}" already has a default playbook (v${current.versionNo}). Use --upgrade or --fill-missing.`;
    }

    // The template the playbook came from, unless another one is asked for.
    const [row] = await tx
      .select({ templateKey: playbooks.templateKey })
      .from(playbooks)
      .where(eq(playbooks.id, current.playbookId));
    const template = findTemplate(templateArg ?? row?.templateKey);
    const fresh = template.build(businessName ?? current.config.business.name);

    let config: PlaybookConfig;
    if (upgrade) {
      config = {
        ...fresh,
        opening: { ...fresh.opening!, templateName: current.config.opening?.templateName ?? null },
        ...(fresh.followUps
          ? {
              followUps: {
                ...fresh.followUps,
                template: {
                  ...fresh.followUps.template,
                  templateName: current.config.followUps?.template.templateName ?? null,
                },
              },
            }
          : {}),
      };
    } else {
      const added = fresh.rules.filter((rule) => !current.config.rules.includes(rule));
      config = {
        ...current.config,
        rules: [...current.config.rules, ...added].slice(0, MAX_RULES),
        ...(current.config.scoring || !fresh.scoring ? {} : { scoring: fresh.scoring }),
        ...(current.config.followUps || !fresh.followUps ? {} : { followUps: fresh.followUps }),
      };
    }
    const next = await publishPlaybookVersion(tx, {
      tenantId: workspace.id,
      playbookId: current.playbookId,
      config: playbookConfigSchema.parse(config),
    });
    return `✓ Published v${next.versionNo} of "${workspace.name}"'s playbook from "${template.name}" (${upgrade ? 'upgrade' : 'filled missing parts'})`;
  });
  console.log(message);
} finally {
  await pool.end();
}
