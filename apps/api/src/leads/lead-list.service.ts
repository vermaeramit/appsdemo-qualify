import { PassThrough } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import {
  type DbHandle,
  configsByVersion,
  currentAgentConfigs,
  leadSheetCells,
  leadSheetColumns,
  originOf,
  sheetQuestions,
  getDefaultPublishedPlaybook,
  type LeadListKey,
  listLeads,
  withTenant,
} from '@qualify/db';
import { type LeadFilters, type LeadListResponse, leadListResponseSchema } from '@qualify/shared';
import ExcelJS from 'exceljs';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { postgresTimeZone } from '../common/time-zone';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

/** The export stops here (a period this large belongs in a webhook or the API). */
export const EXPORT_MAX_ROWS = 50_000;
const EXPORT_PAGE = 1_000;

const iso = (text: string | null) => (text ? new Date(text).toISOString() : null);

function filtersFor(filters: LeadFilters, timeZone: string) {
  return {
    timeZone,
    from: filters.from,
    to: filters.to,
    q: filters.q,
    statuses: filters.status,
    grades: filters.grade,
    sources: filters.source,
  };
}

/** The leads list and its Excel export (same filters, same order). */
@Injectable()
export class LeadListService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {}

  async list(
    workspace: WorkspaceContext,
    filters: LeadFilters,
    page: { limit: number; cursor?: string | undefined },
  ): Promise<LeadListResponse> {
    const after = decodeCursor(page.cursor, filters.sort === 'score' ? 'integer' : 'timestamp');
    const { result, definitions, byVersion } = await withTenant(
      this.handle.db,
      workspace.tenantId,
      async (tx) => {
        const timeZone = await postgresTimeZone(tx, filters.tz);
        const playbook = await getDefaultPublishedPlaybook(tx);
        const result = await listLeads(tx, {
          ...filtersFor(filters, timeZone),
          sort: filters.sort,
          limit: page.limit,
          after,
        });
        // Each lead's own agent's questions (D-086); unpinned leads use the default agent.
        const byVersion = await configsByVersion(
          tx,
          result.rows.map((row) => row.playbookVersionId),
        );
        return { result, definitions: playbook?.config.fields ?? [], byVersion };
      },
    );
    const requiredFor = (versionId: string | null) =>
      ((versionId && byVersion.get(versionId)?.fields) || definitions).filter(
        (field) => field.required,
      );
    return leadListResponseSchema.parse({
      items: result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        source: row.source,
        status: row.status,
        grade: row.grade,
        score: row.score,
        scoreReason: row.scoreDetails?.reason ?? null,
        requiredDone: requiredFor(row.playbookVersionId).filter((field) => row.fields[field.key])
          .length,
        requiredTotal: requiredFor(row.playbookVersionId).length,
        origin: originOf(row.attribution),
        createdAt: iso(row.createdAt),
        lastMessageAt: iso(row.lastMessageAt),
      })),
      nextCursor: result.next ? encodeCursor(result.next.sortKey, result.next.id) : null,
      total: result.total ?? 0,
      from: result.from,
      to: result.to,
    });
  }

  /**
   * Streams an .xlsx of every lead matching the filters (up to EXPORT_MAX_ROWS), one keyset page
   * per short transaction. Columns: the lead, its score, where it came from, every playbook
   * answer, and a link to the conversation.
   */
  async export(
    workspace: WorkspaceContext,
    filters: LeadFilters,
  ): Promise<{ stream: PassThrough; filename: string }> {
    const setup = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const timeZone = await postgresTimeZone(tx, filters.tz);
      // One column per question across every agent (default agent first), deduplicated by key.
      const allFields = sheetQuestions(await currentAgentConfigs(tx));
      // Resolves the range once, so the file name and every page agree.
      const probe = await listLeads(tx, {
        ...filtersFor(filters, timeZone),
        sort: filters.sort,
        limit: 1,
        withTotal: false,
      });
      return { timeZone, definitions: allFields, probe };
    });
    const { timeZone, definitions } = setup;
    const range = { from: setup.probe.from, to: setup.probe.to };

    const stream = new PassThrough();
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream, useStyles: true });
    workbook.creator = 'AppsDemo Qualify';
    const sheet = workbook.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
    sheet.columns = leadSheetColumns(definitions);
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).commit();

    const write = async () => {
      let after: LeadListKey | null = null;
      let written = 0;
      do {
        const page = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
          listLeads(tx, {
            ...filtersFor(filters, timeZone),
            ...range,
            sort: filters.sort,
            limit: EXPORT_PAGE,
            after,
            withTotal: false,
          }),
        );
        for (const row of page.rows) {
          sheet
            .addRow(
              leadSheetCells(row, definitions, { timeZone, appBaseUrl: this.env.APP_BASE_URL }),
            )
            .commit();
          written += 1;
          if (written >= EXPORT_MAX_ROWS) break;
        }
        after = written < EXPORT_MAX_ROWS ? page.next : null;
      } while (after);
      sheet.commit();
      await workbook.commit();
    };
    write().catch((error: unknown) => stream.destroy(error as Error));

    return { stream, filename: `leads-${range.from}-to-${range.to}.xlsx` };
  }
}
