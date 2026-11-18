import { eq } from 'drizzle-orm';
import type { LeadAttribution, LeadScoreDetails, LeadSignals } from '@qualify/shared';
import { leads } from './schema/index.ts';
import type { Transaction } from './tenant.ts';

export interface LeadScoreColumns {
  score: number;
  grade: 'hot' | 'warm' | 'cold' | 'disqualified';
  scoreDetails: LeadScoreDetails;
  scoredAt: Date;
}

/** What a scorer sees: the lead after merging the new answers. */
export interface LeadForScoring {
  fields: Record<string, string>;
  signals: LeadSignals | null;
  status: string;
  scoreDetails: LeadScoreDetails | null;
}

/**
 * One lead per phone per tenant: a repeat enquiry updates the same lead and merges answers (new
 * answers win). Used by every intake path (API, dashboard, Meta lead forms).
 */
export async function upsertLeadFromIntake(
  tx: Transaction,
  input: {
    tenantId: string;
    phoneE164: string;
    name: string | null;
    source: 'api' | 'meta_form' | 'ctwa' | 'whatsapp_inbound';
    fields: Record<string, string>;
    /** Where this enquiry came from; replaces the previous one (last touch). */
    attribution: LeadAttribution;
    /** The agent version that handles this enquiry (routing, D-086). */
    playbookVersionId?: string | null;
    score: (lead: LeadForScoring) => LeadScoreColumns | null;
  },
): Promise<{ leadId: string; isNewLead: boolean }> {
  const [existing] = await tx
    .select({
      id: leads.id,
      name: leads.name,
      fields: leads.fields,
      status: leads.status,
      signals: leads.signals,
      scoreDetails: leads.scoreDetails,
    })
    .from(leads)
    .where(eq(leads.phoneE164, input.phoneE164))
    .limit(1);

  const fields = { ...(existing?.fields ?? {}), ...input.fields };
  const score =
    input.score({
      fields,
      signals: existing?.signals ?? null,
      status: existing?.status ?? 'new',
      scoreDetails: existing?.scoreDetails ?? null,
    }) ?? {};

  if (existing) {
    await tx
      .update(leads)
      .set({
        name: input.name ?? existing.name,
        fields,
        attribution: input.attribution,
        ...(input.playbookVersionId ? { playbookVersionId: input.playbookVersionId } : {}),
        ...score,
      })
      .where(eq(leads.id, existing.id));
    return { leadId: existing.id, isNewLead: false };
  }
  const [created] = await tx
    .insert(leads)
    .values({
      tenantId: input.tenantId,
      phoneE164: input.phoneE164,
      name: input.name,
      source: input.source,
      fields,
      attribution: input.attribution,
      playbookVersionId: input.playbookVersionId ?? null,
      ...score,
    })
    .returning({ id: leads.id });
  return { leadId: created!.id, isNewLead: true };
}
