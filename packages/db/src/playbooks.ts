import type { LeadAttribution, PlaybookConfig, PlaybookRoute } from '@qualify/shared';
import { and, desc, eq } from 'drizzle-orm';
import { playbooks, playbookVersions } from './schema/index.ts';
import type { Transaction } from './tenant.ts';

export interface PublishedPlaybook {
  playbookId: string;
  versionId: string;
  versionNo: number;
  config: PlaybookConfig;
}

/** Latest published version of the tenant's default playbook (call inside withTenant). */
export async function getDefaultPublishedPlaybook(
  tx: Transaction,
): Promise<PublishedPlaybook | null> {
  const [row] = await tx
    .select({
      playbookId: playbooks.id,
      versionId: playbookVersions.id,
      versionNo: playbookVersions.versionNo,
      config: playbookVersions.config,
    })
    .from(playbooks)
    .innerJoin(playbookVersions, eq(playbookVersions.playbookId, playbooks.id))
    .where(and(eq(playbooks.isDefault, true), eq(playbookVersions.status, 'published')))
    .orderBy(desc(playbookVersions.versionNo))
    .limit(1);
  return row ?? null;
}

export async function getPlaybookVersion(
  tx: Transaction,
  versionId: string,
): Promise<PublishedPlaybook | null> {
  const [row] = await tx
    .select({
      playbookId: playbookVersions.playbookId,
      versionId: playbookVersions.id,
      versionNo: playbookVersions.versionNo,
      config: playbookVersions.config,
    })
    .from(playbookVersions)
    .where(eq(playbookVersions.id, versionId))
    .limit(1);
  return row ?? null;
}

/**
 * Publishes a new version of a playbook (call inside withTenant). Versions are immutable:
 * running conversations keep the version they started with.
 */
export async function publishPlaybookVersion(
  tx: Transaction,
  input: { tenantId: string; playbookId: string; config: PlaybookConfig },
): Promise<PublishedPlaybook> {
  const [latest] = await tx
    .select({ versionNo: playbookVersions.versionNo })
    .from(playbookVersions)
    .where(eq(playbookVersions.playbookId, input.playbookId))
    .orderBy(desc(playbookVersions.versionNo))
    .limit(1);
  const versionNo = (latest?.versionNo ?? 0) + 1;
  const [version] = await tx
    .insert(playbookVersions)
    .values({
      tenantId: input.tenantId,
      playbookId: input.playbookId,
      versionNo,
      status: 'published',
      config: input.config,
      publishedAt: new Date(),
    })
    .returning({ id: playbookVersions.id });
  return { playbookId: input.playbookId, versionId: version!.id, versionNo, config: input.config };
}

/**
 * Creates a playbook with a published v1 (call inside withTenant). When `isDefault` is set and
 * the tenant already has a default playbook, the existing default is kept and nothing is created.
 */
export async function createPublishedPlaybook(
  tx: Transaction,
  input: {
    tenantId: string;
    name: string;
    templateKey: string | null;
    config: PlaybookConfig;
    isDefault: boolean;
  },
): Promise<PublishedPlaybook | null> {
  if (input.isDefault) {
    const [existing] = await tx
      .select({ id: playbooks.id })
      .from(playbooks)
      .where(eq(playbooks.isDefault, true))
      .limit(1);
    if (existing) return null;
  }
  const [playbook] = await tx
    .insert(playbooks)
    .values({
      tenantId: input.tenantId,
      name: input.name,
      templateKey: input.templateKey,
      isDefault: input.isDefault,
    })
    .returning({ id: playbooks.id });
  const [version] = await tx
    .insert(playbookVersions)
    .values({
      tenantId: input.tenantId,
      playbookId: playbook!.id,
      versionNo: 1,
      status: 'published',
      config: input.config,
      publishedAt: new Date(),
    })
    .returning({ id: playbookVersions.id });
  return { playbookId: playbook!.id, versionId: version!.id, versionNo: 1, config: input.config };
}

/** True when a lead with this attribution belongs to an agent with these routes (D-086). */
export function matchesRoute(
  routes: readonly PlaybookRoute[],
  attribution: LeadAttribution | null | undefined,
): boolean {
  if (!attribution) return false;
  return routes.some((route) => {
    if (route.type === 'form') return attribution.formId === route.value;
    if (route.type === 'ad') return attribution.adId === route.value;
    return attribution.campaign?.trim().toLowerCase() === route.value.trim().toLowerCase();
  });
}

/** The latest published version of one playbook (call inside withTenant). */
export async function getLatestPublishedVersion(
  tx: Transaction,
  playbookId: string,
): Promise<PublishedPlaybook | null> {
  const [row] = await tx
    .select({
      playbookId: playbookVersions.playbookId,
      versionId: playbookVersions.id,
      versionNo: playbookVersions.versionNo,
      config: playbookVersions.config,
    })
    .from(playbookVersions)
    .where(
      and(eq(playbookVersions.playbookId, playbookId), eq(playbookVersions.status, 'published')),
    )
    .orderBy(desc(playbookVersions.versionNo))
    .limit(1);
  return row ?? null;
}

/**
 * The agent for a new enquiry: the first non-default agent whose routes match where the lead
 * came from (form, ad, campaign), else the default agent (call inside withTenant).
 */
export async function resolvePlaybookForAttribution(
  tx: Transaction,
  attribution: LeadAttribution | null | undefined,
): Promise<PublishedPlaybook | null> {
  if (attribution) {
    const candidates = await tx
      .select({ id: playbooks.id, routes: playbooks.routes })
      .from(playbooks)
      .where(eq(playbooks.isDefault, false))
      .orderBy(playbooks.createdAt);
    const match = candidates.find((candidate) => matchesRoute(candidate.routes, attribution));
    if (match) {
      const version = await getLatestPublishedVersion(tx, match.id);
      if (version) return version;
    }
  }
  return getDefaultPublishedPlaybook(tx);
}
