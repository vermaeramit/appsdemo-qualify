import { eq } from 'drizzle-orm';
import {
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  leadAttributionSchema,
  type WebhookPayload,
  webhookPayloadSchema,
} from '@qualify/shared';
import { getDefaultPublishedPlaybook, getPlaybookVersion } from './playbooks.ts';
import { leads, organization } from './schema/index.ts';
import type { Transaction } from './tenant.ts';

const iso = (date: Date | null) => (date ? date.toISOString() : null);

/**
 * The lead as a webhook receiver sees it (same shape for every event and the test event).
 * Run inside withTenant(). Returns null when the lead no longer exists.
 */
export async function buildWebhookPayload(
  tx: Transaction,
  input: {
    tenantId: string;
    leadId: string;
    type: WebhookPayload['type'];
    eventId: string;
    at: Date;
    appBaseUrl: string;
  },
): Promise<WebhookPayload | null> {
  const [lead] = await tx.select().from(leads).where(eq(leads.id, input.leadId)).limit(1);
  if (!lead) return null;
  const [workspace] = await tx
    .select({ id: organization.id, name: organization.name })
    .from(organization)
    .where(eq(organization.id, input.tenantId))
    .limit(1);
  const playbook =
    (lead.playbookVersionId ? await getPlaybookVersion(tx, lead.playbookVersionId) : null) ??
    (await getDefaultPublishedPlaybook(tx));
  const definitions = [...(playbook?.config.fields ?? [])].sort((a, b) => a.priority - b.priority);
  const known = new Set(definitions.map((field) => field.key));

  return webhookPayloadSchema.parse({
    id: input.eventId,
    type: input.type,
    createdAt: input.at.toISOString(),
    workspace: { id: input.tenantId, name: workspace?.name ?? input.tenantId },
    lead: {
      id: lead.id,
      name: lead.name,
      phone: lead.phoneE164,
      source: lead.source,
      sourceLabel: LEAD_SOURCE_LABELS[lead.source],
      status: lead.status,
      statusLabel:
        LEAD_STATUS_LABELS[lead.status as keyof typeof LEAD_STATUS_LABELS] ?? lead.status,
      grade: lead.grade,
      score: lead.score,
      scoreReason: lead.scoreDetails?.reason ?? null,
      summary: lead.summary,
      answers: definitions
        .filter((field) => lead.fields[field.key])
        .map((field) => ({ key: field.key, label: field.label, value: lead.fields[field.key]! })),
      otherAnswers: Object.fromEntries(
        Object.entries(lead.fields).filter(([key]) => !known.has(key)),
      ),
      attribution: leadAttributionSchema.safeParse(lead.attribution).data ?? null,
      createdAt: lead.createdAt.toISOString(),
      qualifiedAt: iso(lead.qualifiedAt),
      handoffAt: iso(lead.handoffAt),
      conversationUrl: `${input.appBaseUrl.replace(/\/$/, '')}/conversations?lead=${lead.id}`,
    },
  });
}
