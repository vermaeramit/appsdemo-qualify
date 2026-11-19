import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { activityHealth, type DbHandle, listActivity, withTenant } from '@qualify/db';
import {
  type ActivityHealth,
  activityHealthSchema,
  type ActivityPage,
  activityPageSchema,
  activityQuerySchema,
} from '@qualify/shared';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { parseQuery } from '../common/zod-body';
import { DB } from '../tokens';

/**
 * Activity log (D-091): what happened to each lead. One lead's timeline is open to every member
 * (like the conversation); the workspace feed is for owners and managers.
 */
@Controller('activity')
@UseGuards(WorkspaceGuard)
export class ActivityController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  async list(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query() query: unknown,
  ): Promise<ActivityPage> {
    const input = parseQuery(activityQuerySchema, query);
    if (!input.leadId) requireManager(workspace);
    const page = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      listActivity(tx, {
        ...(input.leadId ? { leadId: input.leadId } : {}),
        ...(input.source ? { source: input.source } : {}),
        ...(input.problems ? { problems: true } : {}),
        before: decodeCursor(input.cursor),
        limit: input.limit,
      }),
    );
    return activityPageSchema.parse({
      items: page.items,
      nextCursor: page.next ? encodeCursor(page.next.sortKey, page.next.id) : null,
    });
  }

  /** Is Meta reaching us, and how many problems in the last 24 hours (every member). */
  @Get('health')
  async health(@CurrentWorkspace() workspace: WorkspaceContext): Promise<ActivityHealth> {
    return activityHealthSchema.parse(
      await withTenant(this.handle.db, workspace.tenantId, (tx) => activityHealth(tx)),
    );
  }
}
