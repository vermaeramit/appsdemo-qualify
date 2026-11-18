// Opening template for form/API leads (business-initiated messages need an approved template).
//   pnpm --filter @qualify/worker opening-template create [workspace-slug]   → submit to Meta
//   pnpm --filter @qualify/worker opening-template status [workspace-slug]   → check; when APPROVED,
//                                                                             activate it in the playbook
// The template body and buttons come from the playbook's `opening` section.
import '../load-env.ts';
import { resolveOpening } from '@qualify/core';
import {
  createDb,
  getDefaultPublishedPlaybook,
  organization,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import { WhatsAppClient } from '@qualify/integrations';

export const OPENING_TEMPLATE_NAME = 'qualify_opening_v1';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✗ ${name} is not set in .env`);
    process.exit(1);
  }
  return value;
}

const [command, slug] = process.argv.slice(2);
if (command !== 'create' && command !== 'status') {
  console.error('✗ Usage: opening-template <create|status> [workspace-slug]');
  process.exit(1);
}

const { db, pool } = createDb(required('APP_DATABASE_URL'), { max: 1 });
const wabaId = required('WHATSAPP_DEV_WABA_ID');
const client = new WhatsAppClient({ accessToken: required('WHATSAPP_SYSTEM_USER_TOKEN') });

try {
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
  const playbook = await withTenant(db, workspace.id, (tx) => getDefaultPublishedPlaybook(tx));
  if (!playbook) {
    console.error('✗ The workspace has no playbook. Run install-playbook first.');
    process.exit(1);
  }
  const opening = resolveOpening(playbook.config);

  if (command === 'create') {
    // Meta requires an example value for every {{n}} placeholder.
    const example = opening.bodyParams.map((spec, index) =>
      spec === 'business.name'
        ? playbook.config.business.name
        : (['Rahul', 'Dubai'][index] ?? 'Sample'),
    );
    const created = await client.createTemplate({
      wabaId,
      name: OPENING_TEMPLATE_NAME,
      language: opening.templateLanguage,
      category: 'MARKETING',
      bodyText: opening.bodyText,
      bodyExample: example,
      quickReplies: opening.buttons,
    });
    console.log(
      `✓ Submitted "${OPENING_TEMPLATE_NAME}" (${opening.templateLanguage}) for review: ${created.status}, category ${created.category}`,
    );
    console.log('  Check approval with: pnpm --filter @qualify/worker opening-template status');
  } else {
    const found = await client.findTemplates(wabaId, OPENING_TEMPLATE_NAME);
    const template =
      found.data.find((item) => item.language === opening.templateLanguage) ?? found.data[0];
    if (!template) {
      console.log(`• "${OPENING_TEMPLATE_NAME}" not found. Run: opening-template create`);
    } else if (template.status !== 'APPROVED') {
      console.log(
        `• "${template.name}" is ${template.status} (${template.category}). Try again later.`,
      );
    } else if (opening.templateName === template.name) {
      console.log(
        `✓ "${template.name}" is APPROVED and already active in the playbook (v${playbook.versionNo}).`,
      );
    } else {
      const next = await withTenant(db, workspace.id, (tx) =>
        publishPlaybookVersion(tx, {
          tenantId: workspace.id,
          playbookId: playbook.playbookId,
          config: {
            ...playbook.config,
            opening: {
              ...opening,
              templateName: template.name,
              templateLanguage: template.language,
            },
          },
        }),
      );
      console.log(
        `✓ "${template.name}" is APPROVED and now active in the playbook (v${next.versionNo}).`,
      );
    }
  }
} catch (error) {
  console.error('✗ Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
