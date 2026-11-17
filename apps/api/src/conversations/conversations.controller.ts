import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  UseGuards,
} from '@nestjs/common';
import { asc, type DbHandle, eq, leads, messages, sql, withTenant } from '@qualify/db';
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

/** Read-only WhatsApp conversations of the active workspace (all queries through RLS). */
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
    const parsed = leadIdSchema.safeParse(leadIdParam);
    if (!parsed.success) throw new BadRequestException('Invalid conversation id');
    const leadId = parsed.data;

    const result = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const [lead] = await tx.select().from(leads).where(eq(leads.id, leadId)).limit(1);
      if (!lead) return null;
      const rows = await tx
        .select()
        .from(messages)
        .where(eq(messages.leadId, leadId))
        .orderBy(asc(messages.createdAt))
        .limit(200);
      return { lead, rows };
    });
    if (!result) throw new NotFoundException('Conversation not found');

    return conversationThreadSchema.parse({
      lead: { id: result.lead.id, phone: result.lead.phoneE164, name: result.lead.name },
      messages: result.rows.map((row) => ({
        id: row.id,
        direction: row.direction,
        sender: row.sender,
        type: row.type,
        body: row.body,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    });
  }
}
