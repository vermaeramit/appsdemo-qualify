import { Body, Controller, Get, Inject, Param, Put, Query, UseGuards } from '@nestjs/common';
import { type DbHandle, listLeadFormSubmissions, withTenant } from '@qualify/db';
import {
  type FormMappingResponse,
  type MetaLeadItem,
  type MetaLeadsResponse,
  metaLeadsQuerySchema,
  metaLeadsResponseSchema,
  updateFormMappingSchema,
} from '@qualify/shared';
import { z } from 'zod';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { postgresTimeZone } from '../common/time-zone';
import { requireManager } from '../auth/roles';
import { parseBody, parseQuery } from '../common/zod-body';
import { FormMappingService, parseFormId } from './form-mapping.service';
import { DB } from '../tokens';

// Meta's field_data as stored: [{ name, values }]. Lenient on purpose: whatever arrived is shown.
const rawFieldsSchema = z.array(
  z.object({ name: z.coerce.string(), values: z.array(z.unknown()).default([]) }),
);

const text = (value: unknown): string =>
  typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value);

/** The submission's fields as received; anything that isn't Meta's usual shape is shown raw. */
function fieldsOf(raw: unknown): MetaLeadItem['fields'] {
  const parsed = rawFieldsSchema.safeParse(raw);
  if (!parsed.success) return [{ name: 'field_data', values: [text(raw)] }];
  return parsed.data.map((field) => ({ name: field.name, values: field.values.map(text) }));
}

/** Every Meta lead form submission, exactly as received (any form, any field), newest first. */
@Controller('meta-leads')
@UseGuards(WorkspaceGuard)
export class MetaLeadsController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(FormMappingService) private readonly mappings: FormMappingService,
  ) {}

  /** How a form's questions feed the AI agent's questions. */
  @Get('forms/:formId/mapping')
  mapping(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('formId') formId: string,
  ): Promise<FormMappingResponse> {
    return this.mappings.get(workspace, parseFormId(formId));
  }

  /** Correct the mapping (owners and managers); applies to new submissions. */
  @Put('forms/:formId/mapping')
  updateMapping(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('formId') formId: string,
    @Body() body: unknown,
  ): Promise<FormMappingResponse> {
    requireManager(workspace);
    return this.mappings.update(
      workspace,
      parseFormId(formId),
      parseBody(updateFormMappingSchema, body),
    );
  }

  @Get()
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: unknown,
  ): Promise<MetaLeadsResponse> {
    const input = parseQuery(metaLeadsQuerySchema, query);
    const after = decodeCursor(input.cursor);

    const page = await withTenant(this.handle.db, workspace.tenantId, async (tx) =>
      listLeadFormSubmissions(tx, {
        timeZone: await postgresTimeZone(tx, input.tz),
        from: input.from,
        to: input.to,
        formId: input.formId,
        limit: input.limit,
        after,
      }),
    );

    return metaLeadsResponseSchema.parse({
      items: page.rows.map((row) => ({
        id: row.id,
        receivedAt: new Date(row.createdAt).toISOString(),
        leadgenId: row.leadgenId,
        formId: row.formId,
        formName: row.formName,
        pageId: row.pageId,
        pageName: row.pageName,
        adId: row.adId,
        lead:
          row.leadId && row.leadPhone
            ? { id: row.leadId, name: row.leadName, phone: row.leadPhone }
            : null,
        fields: fieldsOf(row.fieldData),
        rawFieldData: row.fieldData,
      })),
      nextCursor: page.next ? encodeCursor(page.next.sortKey, page.next.id) : null,
      total: page.total,
      from: page.from,
      to: page.to,
      forms: page.forms,
    });
  }
}
