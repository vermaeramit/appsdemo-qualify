import { buildSummaryRequest, type HistoryMessage, leadScoreColumns } from '@qualify/core';
import { type Database, eq, leads, withTenant } from '@qualify/db';
import type { LlmClient, ReasoningEffort } from '@qualify/integrations';
import type { LeadScoreDetails, PlaybookConfig } from '@qualify/shared';
import type { Logger } from '../logger.ts';

/** The lead's score columns (see leadScoreColumns in core). */
export const scoreColumns = leadScoreColumns;

/** A conversation is final when the lead is qualified, handed off, not a fit or not replying. */
export const FINAL_STATUSES = new Set(['qualified', 'handoff', 'disqualified', 'unresponsive']);

/**
 * Writes the 2–3 line summary for a finished conversation and stores it with its token usage
 * (counted on the Costs page). Failures are logged, never thrown: the score is already saved.
 */
export async function writeSummary(
  deps: {
    db: Database;
    llm: LlmClient | null;
    model: string;
    reasoningEffort: ReasoningEffort;
    logger: Pick<Logger, 'info' | 'warn' | 'error'>;
  },
  input: {
    tenantId: string;
    leadId: string;
    config: PlaybookConfig;
    history: readonly HistoryMessage[];
    fields: Record<string, string>;
    scoreDetails: LeadScoreDetails;
  },
): Promise<void> {
  if (!deps.llm || !input.history.some((message) => message.direction === 'inbound')) return;
  try {
    const request = buildSummaryRequest(input.config, input.history, input.fields);
    const { text, usage } = await deps.llm.generateText({
      model: deps.model,
      system: request.system,
      messages: [{ role: 'user', content: request.prompt }],
      reasoningEffort: deps.reasoningEffort,
    });
    await withTenant(deps.db, input.tenantId, (tx) =>
      tx
        .update(leads)
        .set({
          summary: text.trim().slice(0, 1_000),
          scoreDetails: {
            ...input.scoreDetails,
            summaryUsage: {
              model: usage.model,
              inputTokens: usage.inputTokens,
              cachedInputTokens: usage.cachedInputTokens,
              outputTokens: usage.outputTokens,
              at: new Date().toISOString(),
            },
          },
        })
        .where(eq(leads.id, input.leadId)),
    );
  } catch (error) {
    deps.logger.warn(
      { tenantId: input.tenantId, leadId: input.leadId, err: error },
      'Summary failed',
    );
  }
}
