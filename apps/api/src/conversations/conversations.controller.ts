import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  asc,
  auditLogs,
  type DbHandle,
  eq,
  getDefaultPublishedPlaybook,
  getPlaybookVersion,
  leads,
  messages,
  sql,
  withTenant,
} from '@qualify/db';
import {
  type ConversationList,
  conversationListSchema,
  type ConversationThread,
  conversationThreadSchema,
} from '@qualify/shared';
import { z } from 'zod';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { DB } from '../tokens';

const leadIdSchema = z.uuid();

function parseLeadId(value: string): string {
  const parsed = leadIdSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid conversation id');
  return parsed.data;
}

/** WhatsApp conversations of the active workspace (all queries through RLS). */
@Controller('conversations')
@UseGuards(WorkspaceGuard)
export class ConversationsController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<ConversationList> {
    const rows = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      tx
        .select({
          leadId: leads.id,
          phone: leads.phoneE164,
          name: leads.name,
          lastMessageAt: leads.lastMessageAt,
          // Correlated subqueries must reference the outer table explicitly: in single-table
          // selects Drizzle renders ${leads.id} as a bare "id", which would bind to m.id.
          lastMessage: sql<string | null>`(
            select m.body from messages m where m.lead_id = leads.id
            order by m.created_at desc limit 1)`,
          messageCount: sql<number>`(select count(*)::int from messages m where m.lead_id = leads.id)`,
        })
        .from(leads)
        .orderBy(sql`${leads.lastMessageAt} desc nulls last`)
        .limit(50),
    );

    return conversationListSchema.parse({
      conversations: rows.map((row) => ({
        ...row,
        lastMessageAt: row.lastMessageAt?.toISOString() ?? null,
      })),
    });
  }

  @Get(':leadId')
  async thread(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('leadId') leadIdParam: string,
  ): Promise<ConversationThread> {
    const leadId = parseLeadId(leadIdParam);

    const result = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) return null;
      const rows = await tx
        .select()
        .from(messages)
        .where(eq(messages.leadId, leadId))
        .orderBy(asc(messages.createdAt))
        .limit(200);
      const playbook = lead.playbookVersionId
        ? await getPlaybookVersion(tx, lead.playbookVersionId)
        : await getDefaultPublishedPlaybook(tx);
      return { lead, rows, playbook };
    });
    if (!result) throw new NotFoundException('Conversation not found');
    const { lead, rows, playbook } = result;

    return conversationThreadSchema.parse({
      lead: {
        id: lead.id,
        phone: lead.phoneE164,
        name: lead.name,
        status: lead.status,
        aiPaused: lead.aiPaused,
        language: lead.language,
        fields: lead.fields,
        fieldDefinitions: [...(playbook?.config.fields ?? [])]
          .sort((a, b) => a.priority - b.priority)
          .map((field) => ({ key: field.key, label: field.label, required: field.required })),
        score: lead.score,
        grade: lead.grade,
        scoreDetails: lead.scoreDetails,
        summary: lead.summary,
      },
      messages: rows.map((row) => ({
        id: row.id,
        direction: row.direction,
        sender: row.sender,
        type: row.type,
        body: row.body,
        status: row.status,
        errorMessage:
          row.status === 'failed'
            ? typeof row.error?.message === 'string'
              ? row.error.message
              : 'Not delivered'
            : null,
        createdAt: row.createdAt.toISOString(),
      })),
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
  }
}
