import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  and,
  auditLogs,
  desc,
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  getPlaybookVersion,
  leads,
  messages,
  playbooks,
  sql,
  withTenant,
} from '@qualify/db';
import {
  type ConversationList,
  conversationListSchema,
  type ConversationThread,
  conversationThreadSchema,
  cursorSchema,
  leadAttributionSchema,
  pageLimitSchema,
  storedLeadOutcomeSchema,
} from '@qualify/shared';
import { deliveryErrorMessage, describeInboundMessage } from '@qualify/core';
import { z } from 'zod';
import { actorName, recordApiActivity } from '../activity/record';
import { SupportService } from '../admin/support.service';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { parseQuery } from '../common/zod-body';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { DB } from '../tokens';

const leadIdSchema = z.uuid();
const listQuerySchema = z.object({
  cursor: cursorSchema.optional(),
  limit: pageLimitSchema.default(30),
});
const threadQuerySchema = z.object({ before: cursorSchema.optional() });
/** Messages per thread page (newest first, shown oldest first). */
const THREAD_PAGE = 100;

function parseLeadId(value: string): string {
  const parsed = leadIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid conversation id');
  return parsed.data;
}

/** WhatsApp conversations of the active workspace (all queries through RLS). */
@Controller('conversations')
@UseGuards(WorkspaceGuard)
export class ConversationsController {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(SupportService) private readonly support: SupportService,
  ) {}

  /** Leads by latest activity, newest first; keyset pagination on (activity, id). */
  @Get()
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: unknown,
  ): Promise<ConversationList> {
    const input = parseQuery(listQuerySchema, query);
    const cursor = decodeCursor(input.cursor);
    const activity = sql`coalesce(l.last_message_at, l.created_at)`;
    const rows = await withTenant(
      this.handle.db,
      workspace.tenantId,
      async (tx) =>
        (
          await tx.execute<{
            lead_id: string;
            phone: string;
            name: string | null;
            last_message_at: string | null;
            activity: string;
            last_message: string | null;
            last_direction: string | null;
            last_type: string | null;
            last_payload: unknown;
            message_count: number;
          }>(sql`
          select l.id as lead_id, l.phone_e164 as phone, l.name,
                 l.last_message_at::text as last_message_at, ${activity}::text as activity,
                 last.body as last_message, last.direction as last_direction,
                 last.type as last_type, last.payload as last_payload,
                 (select count(*)::int from messages m where m.lead_id = l.id) as message_count
          from leads l
          left join lateral (
            select m.body, m.direction, m.type, m.payload from messages m
            where m.lead_id = l.id order by m.created_at desc limit 1
          ) last on true
          where ${cursor ? sql`(${activity}, l.id) < (${cursor.sortKey}::timestamptz, ${cursor.id}::uuid)` : sql`true`}
          order by ${activity} desc, l.id desc
          limit ${input.limit + 1}`)
        ).rows,
    );
    const page = rows.slice(0, input.limit);
    const last = page.at(-1);
    return conversationListSchema.parse({
      conversations: page.map((row) => ({
        leadId: row.lead_id,
        phone: row.phone,
        name: row.name,
        lastMessageAt: row.last_message_at ? new Date(row.last_message_at).toISOString() : null,
        // A photo, voice message… shows what it was (D-099).
        lastMessage:
          row.last_message ??
          (row.last_direction === 'inbound' && row.last_type
            ? describeInboundMessage(row.last_type, row.last_payload).label
            : null),
        messageCount: row.message_count,
      })),
      nextCursor:
        rows.length > input.limit && last ? encodeCursor(last.activity, last.lead_id) : null,
    });
  }

  /** The lead and its latest messages (oldest first); ?before=<cursor> loads older ones. */
  @Get(':leadId')
  async thread(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('leadId') leadIdParam: string,
    @Query() query: unknown,
  ): Promise<ConversationThread> {
    const leadId = parseLeadId(leadIdParam);
    const before = decodeCursor(parseQuery(threadQuerySchema, query).before);

    const result = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) return null;
      const rows = await tx
        .select({
          id: messages.id,
          direction: messages.direction,
          sender: messages.sender,
          type: messages.type,
          body: messages.body,
          payload: messages.payload,
          status: messages.status,
          error: messages.error,
          createdAt: messages.createdAt,
          createdAtText: sql<string>`${messages.createdAt}::text`,
        })
        .from(messages)
        .where(
          before
            ? and(
                eq(messages.leadId, leadId),
                sql`(${messages.createdAt}, ${messages.id}) < (${before.sortKey}::timestamptz, ${before.id}::uuid)`,
              )
            : eq(messages.leadId, leadId),
        )
        .orderBy(desc(messages.createdAt), desc(messages.id))
        .limit(THREAD_PAGE + 1);
      const playbook = lead.playbookVersionId
        ? await getPlaybookVersion(tx, lead.playbookVersionId)
        : await getDefaultPublishedPlaybook(tx);
      const [agent] = playbook
        ? await tx
            .select({ name: playbooks.name })
            .from(playbooks)
            .where(eq(playbooks.id, playbook.playbookId))
            .limit(1)
        : [];
      return { lead, rows, playbook, agentName: agent?.name ?? null };
    });
    if (!result) throw new NotFoundException('Conversation not found');
    const { lead, rows, playbook, agentName } = result;
    // A support view records each conversation it opens (D-092).
    if (workspace.support && !before) await this.support.noteConversationView(workspace, lead.id);
    const page = rows.slice(0, THREAD_PAGE);
    const oldest = page.at(-1);

    return conversationThreadSchema.parse({
      lead: {
        id: lead.id,
        phone: lead.phoneE164,
        name: lead.name,
        status: lead.status,
        aiPaused: lead.aiPaused,
        language: lead.language,
        fields: lead.fields,
        unconfirmedFields: lead.unconfirmedFields,
        fieldDefinitions: [...(playbook?.config.fields ?? [])]
          .sort((a, b) => a.priority - b.priority)
          .map((field) => ({ key: field.key, label: field.label, required: field.required })),
        score: lead.score,
        grade: lead.grade,
        scoreDetails: lead.scoreDetails,
        summary: lead.summary,
        source: lead.source,
        agentName,
        attribution: leadAttributionSchema.safeParse(lead.attribution).data ?? null,
        outcome: storedLeadOutcomeSchema.safeParse(lead.outcome).data ?? null,
      },
      messages: [...page].reverse().map((row) => ({
        id: row.id,
        direction: row.direction,
        sender: row.sender,
        type: row.type,
        body: row.body,
        status: row.status,
        errorMessage: row.status === 'failed' ? deliveryErrorMessage(row.error) : null,
        display:
          row.direction === 'inbound' && row.body === null
            ? describeInboundMessage(row.type, row.payload)
            : null,
        createdAt: row.createdAt.toISOString(),
      })),
      olderCursor:
        rows.length > THREAD_PAGE && oldest ? encodeCursor(oldest.createdAtText, oldest.id) : null,
    });
  }

  /** A human takes over: the AI stops replying to this lead. */
  @Post(':leadId/pause')
  @HttpCode(204)
  async pause(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('leadId') leadIdParam: string,
  ): Promise<void> {
    await this.setPaused(workspace, parseLeadId(leadIdParam), true);
  }

  /** Hand the conversation back to the AI. It answers the lead's next message. */
  @Post(':leadId/resume')
  @HttpCode(204)
  async resume(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('leadId') leadIdParam: string,
  ): Promise<void> {
    await this.setPaused(workspace, parseLeadId(leadIdParam), false);
  }

  private async setPaused(workspace: WorkspaceContext, leadId: string, paused: boolean) {
    const updated = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [lead] = await tx
        .update(leads)
        .set({
          aiPaused: paused,
          // Resuming a handed-off chat puts it back in the qualification flow.
          ...(paused
            ? {}
            : {
                status: sql`case when ${leads.status} = 'handoff' then 'engaged' else ${leads.status} end`,
              }),
        })
        .where(eq(leads.id, leadId))
        .returning({ id: leads.id });
      if (!lead) return false;
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: paused ? 'conversation.ai_paused' : 'conversation.ai_resumed',
        target: leadId,
      });
      return true;
    });
    if (!updated) throw new NotFoundException('Conversation not found');
    const actor = await actorName(this.handle.db, workspace.userId);
    await recordApiActivity(this.handle.db, {
      tenantId: workspace.tenantId,
      leadId,
      source: 'team',
      kind: paused ? 'team.ai_paused' : 'team.ai_resumed',
      message: paused
        ? `${actor} paused the AI: the team handles this lead`
        : `${actor} resumed the AI: it answers the lead's next message`,
    });
  }
}
