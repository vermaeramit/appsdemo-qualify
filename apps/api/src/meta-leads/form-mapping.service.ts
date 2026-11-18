import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { FORM_CONTACT_KEYS, sanitizeFormMapping } from '@qualify/core';
import {
  auditLogs,
  type DbHandle,
  desc,
  eq,
  resolvePlaybookForAttribution,
  leadFormMappings,
  leadFormSubmissions,
  sql,
  type Transaction,
  withTenant,
} from '@qualify/db';
import {
  type FormMappingResponse,
  formMappingResponseSchema,
  type UpdateFormMapping,
} from '@qualify/shared';
import { z } from 'zod';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { DB } from '../tokens';

const formIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);

// Meta's field_data: [{ name, values }]. Lenient: only used to list questions and samples.
const fieldDataSchema = z.array(
  z.object({ name: z.string(), values: z.array(z.unknown()).default([]) }),
);

export function parseFormId(value: string): string {
  const parsed = formIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid form id');
  return parsed.data;
}

/**
 * How a Meta lead form's questions feed the playbook. The worker works the mapping out once per
 * form (AI or wording); the team can correct it here. Changes apply to new submissions.
 */
@Injectable()
export class FormMappingService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  get(workspace: WorkspaceContext, formId: string): Promise<FormMappingResponse> {
    return withTenant(this.handle.db, workspace.tenantId, (tx) => this.load(tx, formId));
  }

  update(
    workspace: WorkspaceContext,
    formId: string,
    input: UpdateFormMapping,
  ): Promise<FormMappingResponse> {
    return withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const current = await this.load(tx, formId);
      const fieldKeys = new Set(current.fields.map((field) => field.key));
      const unknown = Object.values(input.mapping).filter(
        (target): target is string => target !== null && !fieldKeys.has(target),
      );
      if (unknown.length) {
        throw new BadRequestException(`Not a question in the AI agent: ${unknown.join(', ')}`);
      }
      const playbook = await resolvePlaybookForAttribution(tx, {
        channel: 'meta_form',
        at: new Date().toISOString(),
        formId,
      });
      const mapping = sanitizeFormMapping(
        input.mapping,
        current.questions.map((question) => ({ key: question.key })),
        playbook?.config.fields ?? [],
      );
      await tx
        .insert(leadFormMappings)
        .values({
          tenantId: workspace.tenantId,
          formId,
          formName: current.formName,
          mapping,
          source: 'manual',
        })
        .onConflictDoUpdate({
          target: [leadFormMappings.tenantId, leadFormMappings.formId],
          set: { mapping, source: 'manual', updatedAt: sql`now()` },
        });
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: 'lead_form.mapping_updated',
        target: formId,
        metadata: { mapping },
      });
      return this.load(tx, formId);
    });
  }

  private async load(tx: Transaction, formId: string): Promise<FormMappingResponse> {
    const [stored] = await tx
      .select()
      .from(leadFormMappings)
      .where(eq(leadFormMappings.formId, formId))
      .limit(1);
    const [latest] = await tx
      .select({ fieldData: leadFormSubmissions.fieldData })
      .from(leadFormSubmissions)
      .where(eq(leadFormSubmissions.formId, formId))
      .orderBy(desc(leadFormSubmissions.createdAt))
      .limit(1);
    if (!stored && !latest) throw new NotFoundException('No submissions from this form yet');

    // The agent this form routes to (D-086), else the default agent.
    const playbook = await resolvePlaybookForAttribution(tx, {
      channel: 'meta_form',
      at: new Date().toISOString(),
      formId,
    });
    const fields = [...(playbook?.config.fields ?? [])]
      .sort((a, b) => a.priority - b.priority)
      .map((field) => ({ key: field.key, label: field.label }));
    const fieldKeys = new Set(fields.map((field) => field.key));

    const answers = fieldDataSchema.safeParse(latest?.fieldData).data ?? [];
    const samples = new Map(
      answers.map((answer) => [
        answer.name,
        answer.values.map((value) => (typeof value === 'string' ? value : JSON.stringify(value))),
      ]),
    );
    // The stored mapping's questions first (form order), then any new ones from the answers.
    const keys = [...new Set([...Object.keys(stored?.mapping ?? {}), ...samples.keys()])].filter(
      (key) => !FORM_CONTACT_KEYS.has(key),
    );

    return formMappingResponseSchema.parse({
      formId,
      formName: stored?.formName ?? null,
      source: stored?.source ?? null,
      updatedAt: stored?.updatedAt.toISOString() ?? null,
      questions: keys.map((key) => {
        const target = stored?.mapping[key] ?? null;
        return {
          key,
          sample: samples.get(key)?.join(', ').slice(0, 200) || null,
          target: target && fieldKeys.has(target) ? target : null,
        };
      }),
      fields,
    });
  }
}
