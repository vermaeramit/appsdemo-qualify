import { PassThrough } from 'node:stream';
import { Inject, Injectable } from '@nestjs/common';
import {
  type DbHandle,
  configsByVersion,
  currentAgentConfigs,
  getDefaultPublishedPlaybook,
  type LeadListKey,
  type LeadListRow,
  listLeads,
  withTenant,
} from '@qualify/db';
import {
  LEAD_OUTCOME_LABELS,
  LEAD_SOURCE_LABELS,
  LEAD_STATUS_LABELS,
  type LeadAttribution,
  type LeadFilters,
  type LeadListResponse,
  leadListResponseSchema,
  type PlaybookField,
} from '@qualify/shared';
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

/** Ad headline, form name or campaign of the latest enquiry. */
export function originOf(attribution: LeadAttribution | null): string | null {
  if (!attribution) return null;
  return (
    attribution.headline ??
    attribution.formName ??
    (attribution.formId ? `Form ${attribution.formId}` : null) ??
    attribution.campaign ??
    (attribution.adId ? `Ad ${attribution.adId}` : null)
  );
}

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
      const seen = new Set<string>();
      const allFields = (await currentAgentConfigs(tx))
        .flatMap((config) => [...config.fields].sort((a, b) => a.priority - b.priority))
        .filter((field) => !seen.has(field.key) && Boolean(seen.add(field.key)));
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
    sheet.columns = this.columns(definitions);
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
          sheet.addRow(this.cells(row, definitions, timeZone)).commit();
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

  private columns(definitions: readonly PlaybookField[]): Partial<ExcelJS.Column>[] {
    return [
      { header: 'Created', key: 'created', width: 18 },
      { header: 'Name', key: 'name', width: 22 },
      { header: 'Phone', key: 'phone', width: 16 },
      { header: 'Grade', key: 'grade', width: 10 },
      { header: 'Score', key: 'score', width: 8 },
      { header: 'Status', key: 'status', width: 14 },
      { header: 'Why this score', key: 'reason', width: 40 },
      { header: 'Summary', key: 'summary', width: 50 },
      { header: 'Source', key: 'source', width: 18 },
      { header: 'Ad / form / campaign', key: 'origin', width: 28 },
      { header: 'Ad id', key: 'adId', width: 20 },
      ...definitions.map((field) => ({
        header: field.label,
        key: `field:${field.key}`,
        width: 20,
      })),
      { header: 'Other answers', key: 'other', width: 30 },
      { header: 'Outcome', key: 'outcome', width: 14 },
      { header: 'Deal value', key: 'dealValue', width: 14 },
      { header: 'Last message', key: 'lastMessage', width: 18 },
      { header: 'Qualified at', key: 'qualifiedAt', width: 18 },
      { header: 'Handed off at', key: 'handoffAt', width: 18 },
      { header: 'Conversation', key: 'link', width: 30 },
      { header: 'Lead id', key: 'id', width: 38 },
    ];
  }

  private cells(
    row: LeadListRow,
    definitions: readonly PlaybookField[],
    timeZone: string,
  ): Record<string, string | number | null> {
    const local = (text: string | null) =>
      text
        ? new Intl.DateTimeFormat('sv-SE', {
            timeZone,
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(text))
        : null;
    const known = new Set(definitions.map((field) => field.key));
    const other = Object.entries(row.fields)
      .filter(([key]) => !known.has(key))
      .map(([key, value]) => `${key}: ${value}`)
      .join('; ');
    const grade = row.grade === 'disqualified' ? 'Not a fit' : row.grade;
    return {
      created: local(row.createdAt),
      name: row.name,
      phone: row.phone,
      grade: grade ? grade.charAt(0).toUpperCase() + grade.slice(1) : null,
      score: row.score,
      status: LEAD_STATUS_LABELS[row.status as keyof typeof LEAD_STATUS_LABELS] ?? row.status,
      reason: row.scoreDetails?.reason ?? null,
      summary: row.summary,
      source: LEAD_SOURCE_LABELS[row.source as keyof typeof LEAD_SOURCE_LABELS] ?? row.source,
      origin: originOf(row.attribution),
      adId: row.attribution?.adId ?? null,
      ...Object.fromEntries(
        definitions.map((field) => [`field:${field.key}`, row.fields[field.key] ?? null]),
      ),
      other: other || null,
      outcome: row.outcome ? LEAD_OUTCOME_LABELS[row.outcome.outcome] : null,
      dealValue:
        row.outcome?.value !== undefined
          ? `${row.outcome.value}${row.outcome.currency ? ` ${row.outcome.currency}` : ''}`
          : null,
      lastMessage: local(row.lastMessageAt),
      qualifiedAt: local(row.qualifiedAt),
      handoffAt: local(row.handoffAt),
      link: `${this.env.APP_BASE_URL.replace(/\/$/, '')}/conversations?lead=${row.id}`,
      id: row.id,
    };
  }
}
