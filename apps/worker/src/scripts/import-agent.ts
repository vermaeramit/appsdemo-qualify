// Creates (or updates) an agent from a playbook config in JSON (D-101): copy an agent from one
// environment to another, or install one prepared outside the dashboard.
//   pnpm --filter @qualify/worker import-agent <workspace-slug> <config.json | -> --name="Agent name"
//        [--default]
//   -          read the JSON from stdin (e.g. piped into the worker container in production)
//   --default  make it the workspace's default agent (it then answers every lead no rule matches)
// An agent with the same name gets a new published version instead of a second agent.
import '../load-env.ts';
import { readFileSync } from 'node:fs';
import {
  auditLogs,
  createDb,
  createPublishedPlaybook,
  eq,
  organization,
  playbooks,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import { playbookConfigSchema } from '@qualify/shared';

const url = process.env.APP_DATABASE_URL;
if (!url) {
  console.error('✗ APP_DATABASE_URL is not set');
  process.exit(1);
}

const args = process.argv.slice(2);
const name = args
  .find((arg) => arg.startsWith('--name='))
  ?.slice('--name='.length)
  .trim();
const makeDefault = args.includes('--default');
const [slug, source] = args.filter((arg) => !arg.startsWith('--'));
if (!slug || !source || !name) {
  console.error(
    '✗ Usage: import-agent <workspace-slug> <config.json | -> --name="Agent name" [--default]',
  );
  process.exit(1);
}

const parsed = playbookConfigSchema.safeParse(
  JSON.parse(readFileSync(source === '-' ? 0 : source, 'utf8')),
);
if (!parsed.success) {
  console.error('✗ The config is not a valid playbook:');
  for (const issue of parsed.error.issues.slice(0, 10)) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}
const config = parsed.data;

const { db, pool } = createDb(url, { max: 1 });
try {
  const [workspace] = await db
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.slug, slug));
  if (!workspace) {
    console.error(`✗ No workspace with the slug "${slug}"`);
    process.exit(1);
  }

  const message = await withTenant(db, workspace.id, async (tx) => {
    const all = await tx
      .select({ id: playbooks.id, name: playbooks.name, isDefault: playbooks.isDefault })
      .from(playbooks);
    const existing = all.find((agent) => agent.name.toLowerCase() === name.toLowerCase());
    let agentId: string;
    let versionNo: number;
    if (existing) {
      const version = await publishPlaybookVersion(tx, {
        tenantId: workspace.id,
        playbookId: existing.id,
        config,
      });
      agentId = existing.id;
      versionNo = version.versionNo;
    } else {
      const created = await createPublishedPlaybook(tx, {
        tenantId: workspace.id,
        name,
        templateKey: null,
        config,
        isDefault: false,
      });
      agentId = created!.playbookId;
      versionNo = created!.versionNo;
    }
    const wasDefault = existing?.isDefault ?? false;
    if (makeDefault && !wasDefault) {
      // One default per workspace (partial unique index): unset the old one first.
      await tx.update(playbooks).set({ isDefault: false }).where(eq(playbooks.isDefault, true));
      await tx
        .update(playbooks)
        .set({ isDefault: true, routes: [] })
        .where(eq(playbooks.id, agentId));
    }
    await tx.insert(auditLogs).values({
      tenantId: workspace.id,
      actorUserId: null,
      action: existing ? 'agent.imported_version' : 'agent.imported',
      target: agentId,
      metadata: { name, versionNo, madeDefault: makeDefault && !wasDefault },
    });
    return `✓ ${existing ? 'Published' : 'Created'} "${name}" v${versionNo} in "${workspace.name}"${
      makeDefault ? ' (default agent)' : ''
    } · id ${agentId}`;
  });
  console.log(message);
} finally {
  await pool.end();
}
