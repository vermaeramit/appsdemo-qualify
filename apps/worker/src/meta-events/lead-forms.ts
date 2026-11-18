import {
  buildFormMappingRequest,
  type FormMapping,
  type FormQuestion,
  guessFormMapping,
  leadScoreColumns,
  localToday,
  readFormAnswers,
  sanitizeFormMapping,
} from '@qualify/core';
import {
  and,
  auditLogs,
  type Database,
  eq,
  facebookPages,
  getDefaultPublishedPlaybook,
  leadFormMappings,
  leadFormSubmissions,
  resolveTenantByPageId,
  tenants,
  upsertLeadFromIntake,
  withTenant,
} from '@qualify/db';
import {
  decryptSecret,
  type LeadgenValue,
  type LlmClient,
  type ReasoningEffort,
  toE164,
  type WhatsAppClient,
} from '@qualify/integrations';
import {
  type ContactJob,
  formMappingOutputSchema,
  type LeadAttribution,
  type PlaybookField,
} from '@qualify/shared';
import type { Logger } from '../logger.ts';
import { type EmitLeadEvent } from '../webhooks/webhooks.ts';

/** The Graph calls a lead form needs (fake in tests). */
export type LeadFormClient = Pick<WhatsAppClient, 'getLead' | 'getLeadForm'>;

export interface LeadFormDeps {
  /** Lead events for webhooks (M7). */
  emitLeadEvent?: EmitLeadEvent;
  db: Database;
  logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  masterKey: Buffer | null;
  createClient: (pageAccessToken: string) => LeadFormClient;
  /** Maps a new form's questions to the playbook; without it, matching by wording is used. */
  llm: LlmClient | null;
  model: string;
  reasoningEffort: ReasoningEffort;
  enqueueContact: (job: ContactJob) => Promise<void>;
}

export type LeadFormOutcome =
  'created' | 'updated' | 'duplicate' | 'unknown_page' | 'no_phone' | 'no_playbook' | 'no_token';

/**
 * One Meta lead form submission (leadgen webhook): fetch the answers with the Page token, map
 * them to the playbook once per form, create or update the lead, and queue the opening message.
 * Idempotent on leadgen_id.
 */
export async function handleLeadgen(
  deps: LeadFormDeps,
  value: LeadgenValue,
): Promise<LeadFormOutcome> {
  const { db, logger } = deps;
  const log = { pageId: value.page_id, formId: value.form_id, leadgenId: value.leadgen_id };

  const tenantId = await resolveTenantByPageId(db, value.page_id);
  if (!tenantId) {
    logger.warn(log, 'Lead form submission for a Page not connected to any workspace');
    return 'unknown_page';
  }

  const context = await withTenant(db, tenantId, async (tx) => {
    const [seen] = await tx
      .select({ id: leadFormSubmissions.id })
      .from(leadFormSubmissions)
      .where(eq(leadFormSubmissions.leadgenId, value.leadgen_id))
      .limit(1);
    const [page] = await tx
      .select({ accessTokenEnc: facebookPages.accessTokenEnc })
      .from(facebookPages)
      .where(eq(facebookPages.pageId, value.page_id))
      .limit(1);
    const [stored] = await tx
      .select({ mapping: leadFormMappings.mapping })
      .from(leadFormMappings)
      .where(eq(leadFormMappings.formId, value.form_id))
      .limit(1);
    const playbook = await getDefaultPublishedPlaybook(tx);
    const [tenant] = await tx.select({ timezone: tenants.timezone }).from(tenants).limit(1);
    return { seen: Boolean(seen), page, stored, playbook, tenant };
  });
  if (context.seen) return 'duplicate';
  if (!context.playbook) return 'no_playbook';
  if (!context.page || !deps.masterKey) {
    logger.warn({ ...log, tenantId }, 'No Page token or encryption key: cannot fetch the lead');
    return 'no_token';
  }

  const client = deps.createClient(decryptSecret(context.page.accessTokenEnc, deps.masterKey));
  const lead = await client.getLead(value.leadgen_id);
  // Reading the form needs pages_manage_ads; without it, map from the answers' own keys.
  const form = await client.getLeadForm(value.form_id).catch((error: unknown) => {
    logger.warn(
      { ...log, tenantId, err: error },
      'Could not read the lead form; using answer keys',
    );
    return { id: value.form_id } as Awaited<ReturnType<LeadFormClient['getLeadForm']>>;
  });
  const questions: FormQuestion[] = form.questions?.length
    ? form.questions
    : lead.field_data.map((item) => ({ key: item.name, label: item.name.replace(/_/g, ' ') }));
  const definitions = context.playbook.config.fields;

  let mapping = context.stored?.mapping;
  if (!mapping) {
    const worked = await mapForm(deps, questions, definitions);
    mapping = worked.mapping;
    await withTenant(db, tenantId, (tx) =>
      tx
        .insert(leadFormMappings)
        .values({
          tenantId,
          formId: value.form_id,
          formName: form.name ?? null,
          mapping: worked.mapping,
          source: worked.source,
        })
        .onConflictDoNothing(),
    );
    logger.info({ ...log, tenantId, mapping, source: worked.source }, 'Lead form mapped');
  }

  const answers = readFormAnswers({
    fieldData: lead.field_data,
    questions,
    mapping,
    definitions,
  });
  let phone: string | null = null;
  try {
    phone = answers.phone ? toE164(answers.phone) : null;
  } catch {
    phone = null;
  }

  const today = localToday(context.tenant?.timezone ?? 'Asia/Kolkata');
  const result = await withTenant(db, tenantId, async (tx) => {
    // Claim the submission first: a concurrent retry stops here.
    const [claimed] = await tx
      .insert(leadFormSubmissions)
      .values({
        tenantId,
        leadgenId: value.leadgen_id,
        pageId: value.page_id,
        formId: value.form_id,
        adId: value.ad_id ?? lead.ad_id ?? null,
        fieldData: lead.field_data,
      })
      .onConflictDoNothing()
      .returning({ id: leadFormSubmissions.id });
    if (!claimed) return 'duplicate' as const;
    if (!phone) return 'no_phone' as const;

    const upserted = await upsertLeadFromIntake(tx, {
      tenantId,
      phoneE164: phone,
      name: answers.name,
      source: 'meta_form',
      fields: answers.fields,
      attribution: formAttribution(value, form.name ?? null, value.ad_id ?? lead.ad_id ?? null),
      score: (current) =>
        leadScoreColumns({
          config: context.playbook!.config,
          fields: current.fields,
          signals: current.signals,
          status: current.status,
          today,
          final: false,
          now: new Date(),
          previous: current.scoreDetails,
        }),
    });
    await tx
      .update(leadFormSubmissions)
      .set({ leadId: upserted.leadId })
      .where(
        and(eq(leadFormSubmissions.id, claimed.id), eq(leadFormSubmissions.tenantId, tenantId)),
      );
    await tx.insert(auditLogs).values({
      tenantId,
      actorUserId: null,
      action: 'lead.received_from_form',
      target: upserted.leadId,
      metadata: {
        formId: value.form_id,
        formName: form.name ?? null,
        adId: value.ad_id ?? lead.ad_id ?? null,
        otherAnswers: answers.other,
      },
    });
    return upserted;
  });

  if (result === 'duplicate' || result === 'no_phone') {
    if (result === 'no_phone') logger.warn({ ...log, tenantId }, 'Lead form without a valid phone');
    return result;
  }
  if (result.isNewLead) {
    await deps.emitLeadEvent?.({ tenantId, leadId: result.leadId, type: 'lead.created' });
  }
  await deps.enqueueContact({ tenantId, leadId: result.leadId });
  logger.info({ ...log, tenantId, leadId: result.leadId }, 'Lead received from a Meta form');
  return result.isNewLead ? 'created' : 'updated';
}

/** The form (and ad) behind a submission, as the lead's attribution. */
function formAttribution(
  value: LeadgenValue,
  formName: string | null,
  adId: string | null,
): LeadAttribution {
  return {
    channel: 'meta_form',
    at: new Date().toISOString(),
    formId: value.form_id.slice(0, 64),
    pageId: value.page_id.slice(0, 64),
    ...(formName ? { formName: formName.slice(0, 200) } : {}),
    ...(adId ? { adId: adId.slice(0, 64) } : {}),
  };
}

/** AI mapping (validated), or matching by wording when no AI is configured or it fails. */
async function mapForm(
  deps: LeadFormDeps,
  questions: readonly FormQuestion[],
  definitions: readonly PlaybookField[],
): Promise<{ mapping: FormMapping; source: 'ai' | 'auto' }> {
  if (deps.llm) {
    try {
      const request = buildFormMappingRequest(questions, definitions);
      const { output } = await deps.llm.generateStructured({
        model: deps.model,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
        schema: formMappingOutputSchema,
        reasoningEffort: deps.reasoningEffort,
      });
      const proposed = Object.fromEntries(
        output.mappings.map((entry) => [entry.formKey, entry.fieldKey]),
      );
      return { mapping: sanitizeFormMapping(proposed, questions, definitions), source: 'ai' };
    } catch (error) {
      deps.logger.warn({ err: error }, 'AI form mapping failed; matching by wording');
    }
  }
  return { mapping: guessFormMapping(questions, definitions), source: 'auto' };
}
