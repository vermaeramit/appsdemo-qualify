// Templates for business-initiated messages: the opening (form/API leads) and the follow-up.
//   pnpm --filter @qualify/worker opening-template create [workspace-slug] [--kind=followup]
//       → submit to Meta
//   pnpm --filter @qualify/worker opening-template status [workspace-slug] [--kind=followup]
//       → check; when APPROVED, activate it in the playbook
// The body and buttons come from the playbook (`opening`, or `followUps.template`); the name is
// derived from that text, so a changed text gets its own approval. The same actions are in the
// dashboard (AI agent → Opening / Follow-ups).
import '../load-env.ts';
import {
  followUpTemplateName,
  openingExampleParams,
  openingTemplateName,
  resolveFollowUps,
  resolveOpening,
} from '@qualify/core';
import {
  createDb,
  getDefaultPublishedPlaybook,
  organization,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import { WhatsAppClient } from '@qualify/integrations';
import type { PlaybookConfig, PlaybookOpening } from '@qualify/shared';

const KINDS = {
  opening: {
    read: resolveOpening,
    name: openingTemplateName,
    write: (config: PlaybookConfig, message: PlaybookOpening): PlaybookConfig => ({
      ...config,
      opening: message,
    }),
  },
  followup: {
    read: (config: PlaybookConfig) => resolveFollowUps(config).template,
    name: followUpTemplateName,
    write: (config: PlaybookConfig, message: PlaybookOpening): PlaybookConfig => ({
      ...config,
      followUps: { ...resolveFollowUps(config), template: message },
    }),
  },
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✗ ${name} is not set in .env`);
    process.exit(1);
  }
  return value;
}

const args = process.argv.slice(2);
const kindArg = args.find((arg) => arg.startsWith('--kind='))?.slice('--kind='.length) ?? 'opening';
const [command, slug] = args.filter((arg) => !arg.startsWith('--'));
if ((command !== 'create' && command !== 'status') || !(kindArg in KINDS)) {
  console.error(
    '✗ Usage: opening-template <create|status> [workspace-slug] [--kind=opening|followup]',
  );
  process.exit(1);
}
const kind = KINDS[kindArg as keyof typeof KINDS];

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
  const opening = kind.read(playbook.config);
  const templateName = opening.templateName ?? kind.name(opening);
  console.log(`• ${kindArg} template "${templateName}" (${opening.templateLanguage}):`);
  console.log(`  ${opening.bodyText.replace(/\n/g, '\n  ')}`);
  if (opening.buttons.length) console.log(`  Buttons: ${opening.buttons.join(' | ')}`);

  if (command === 'create') {
    const created = await client.createTemplate({
      wabaId,
      name: templateName,
      language: opening.templateLanguage,
      category: 'MARKETING',
      bodyText: opening.bodyText,
      // Meta requires an example value for every {{n}} placeholder.
      bodyExample: openingExampleParams(opening, playbook.config.business.name),
      quickReplies: opening.buttons,
    });
    console.log(
      `✓ Submitted "${templateName}" (${opening.templateLanguage}) for review: ${created.status}, category ${created.category}`,
    );
    console.log(
      `  Check approval with: pnpm --filter @qualify/worker opening-template status ${workspace.slug} --kind=${kindArg}`,
    );
  } else {
    const found = await client.findTemplates(wabaId, templateName);
    const template =
      found.data.find((item) => item.language === opening.templateLanguage) ?? found.data[0];
    if (!template) {
      console.log(`• "${templateName}" not found. Run: opening-template create`);
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
          config: kind.write(playbook.config, {
            ...opening,
            templateName: template.name,
            templateLanguage: template.language,
          }),
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
