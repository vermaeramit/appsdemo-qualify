// Recomputes every lead's score with the workspace's current scoring (also happens on publish).
//   pnpm --filter @qualify/worker rescore-leads [workspace-slug]
import '../load-env.ts';
import { resolveScoring, scoreLead } from '@qualify/core';
import {
  createDb,
  eq,
  getDefaultPublishedPlaybook,
  leads,
  organization,
  tenants,
  withTenant,
} from '@qualify/db';

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

  const counts = await withTenant(db, workspace.id, async (tx) => {
    const playbook = await getDefaultPublishedPlaybook(tx);
    if (!playbook) throw new Error('The workspace has no playbook');
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants).limit(1);
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: tenant?.timezone ?? 'Asia/Kolkata',
      dateStyle: 'short',
    }).format(new Date());
    const scoring = resolveScoring(playbook.config);
    const rows = await tx.select().from(leads);
    const grades: Record<string, number> = {};
    for (const row of rows) {
      const result = scoreLead({
        definitions: playbook.config.fields,
        scoring,
        fields: row.fields,
        signals: row.signals,
        status: row.status,
        today,
      });
      await tx
        .update(leads)
        .set({
          score: result.score,
          grade: result.grade,
          scoreDetails: {
            ...result.details,
            final:
              row.scoreDetails?.final ??
              ['qualified', 'handoff', 'disqualified', 'unresponsive'].includes(row.status),
            ...(row.scoreDetails?.summaryUsage
              ? { summaryUsage: row.scoreDetails.summaryUsage }
              : {}),
          },
          scoredAt: row.scoredAt ?? new Date(),
        })
        .where(eq(leads.id, row.id));
      grades[result.grade] = (grades[result.grade] ?? 0) + 1;
    }
    return { total: rows.length, grades };
  });
  console.log(`✓ Rescored ${counts.total} leads in "${workspace.name}":`, counts.grades);
} finally {
  await pool.end();
}
