import {
  BadRequestException,
  Body,
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
  and,
  apiKeys,
  auditLogs,
  createApiKey,
  type DbHandle,
  desc,
  eq,
  isNull,
  withTenant,
} from '@qualify/db';
import {
  type ApiKeyList,
  apiKeyListSchema,
  type CreatedApiKey,
  createApiKeyRequestSchema,
  createdApiKeySchema,
} from '@qualify/shared';
import { z } from 'zod';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody } from '../common/zod-body';
import { DB } from '../tokens';

const keyIdSchema = z.uuid();

/** Workspace API keys for the public API (Settings → API keys). Owners and managers only. */
@Controller('api-keys')
@UseGuards(WorkspaceGuard)
export class ApiKeysController {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  @Get()
  async list(@CurrentWorkspace() workspace: WorkspaceContext): Promise<ApiKeyList> {
    requireManager(workspace);
    const rows = await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      tx
        .select({
          id: apiKeys.id,
          name: apiKeys.name,
          prefix: apiKeys.prefix,
          createdAt: apiKeys.createdAt,
          lastUsedAt: apiKeys.lastUsedAt,
          revokedAt: apiKeys.revokedAt,
        })
        .from(apiKeys)
        .orderBy(desc(apiKeys.createdAt))
        .limit(100),
    );
    return apiKeyListSchema.parse({
      keys: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
        revokedAt: row.revokedAt?.toISOString() ?? null,
      })),
    });
  }

  /** The key is returned once; only its hash is stored. */
  @Post()
  async create(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Body() body: unknown,
  ): Promise<CreatedApiKey> {
    requireManager(workspace);
    const { name } = parseBody(createApiKeyRequestSchema, body);
    const created = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const key = await createApiKey(tx, {
        tenantId: workspace.tenantId,
        name,
        createdBy: workspace.userId,
      });
      await tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action: 'api_key.created',
        target: key.id,
        metadata: { name, prefix: key.prefix },
      });
      return key;
    });
    return createdApiKeySchema.parse({ ...created, name });
  }

  @Post(':id/revoke')
  @HttpCode(204)
  async revoke(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') idParam: string,
  ): Promise<void> {
    requireManager(workspace);
    const parsed = keyIdSchema.safeParse(idParam);
    if (!parsed.success) throw new BadRequestException('Invalid key id');
    const revoked = await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
      const rows = await tx
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiKeys.id, parsed.data), isNull(apiKeys.revokedAt)))
        .returning({ id: apiKeys.id });
      if (rows.length) {
        await tx.insert(auditLogs).values({
          tenantId: workspace.tenantId,
          actorUserId: workspace.userId,
          action: 'api_key.revoked',
          target: parsed.data,
          metadata: {},
        });
      }
      return rows.length > 0;
    });
    if (!revoked) throw new NotFoundException('Key not found or already revoked');
  }
}
