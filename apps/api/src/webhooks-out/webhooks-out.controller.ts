import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createWebhookSchema,
  updateWebhookSchema,
  webhookDeliveriesQuerySchema,
} from '@qualify/shared';
import { z } from 'zod';
import { requireManager } from '../auth/roles';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { parseBody, parseQuery } from '../common/zod-body';
import { WebhooksOutService } from './webhooks-out.service';

const idSchema = z.uuid();
function parseId(value: string): string {
  const parsed = idSchema.safeParse(value);
  if (!parsed.success) throw new BadRequestException('Invalid id');
  return parsed.data;
}

/** Outbound webhooks (Integrations page). Owners and managers only. */
@Controller('webhooks')
@UseGuards(WorkspaceGuard)
export class WebhooksOutController {
  constructor(@Inject(WebhooksOutService) private readonly webhooks: WebhooksOutService) {}

  @Get()
  async list(@CurrentWorkspace() workspace: WorkspaceContext) {
    requireManager(workspace);
    return { endpoints: await this.webhooks.list(workspace) };
  }

  @Post()
  create(@CurrentWorkspace() workspace: WorkspaceContext, @Body() body: unknown) {
    requireManager(workspace);
    return this.webhooks.create(workspace, parseBody(createWebhookSchema, body));
  }

  @Patch(':id')
  update(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    requireManager(workspace);
    return this.webhooks.update(workspace, parseId(id), parseBody(updateWebhookSchema, body));
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    await this.webhooks.remove(workspace, parseId(id));
  }

  @Post(':id/rotate-secret')
  rotate(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    return this.webhooks.rotateSecret(workspace, parseId(id));
  }

  @Post(':id/test')
  @HttpCode(202)
  test(@CurrentWorkspace() workspace: WorkspaceContext, @Param('id') id: string) {
    requireManager(workspace);
    return this.webhooks.test(workspace, parseId(id));
  }

  @Get(':id/deliveries')
  deliveries(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('id') id: string,
    @Query() query: unknown,
  ) {
    requireManager(workspace);
    const { cursor } = parseQuery(webhookDeliveriesQuerySchema, query);
    return this.webhooks.deliveryLog(workspace, parseId(id), cursor);
  }

  @Post('deliveries/:deliveryId/resend')
  @HttpCode(202)
  async resend(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Param('deliveryId') deliveryId: string,
  ) {
    requireManager(workspace);
    await this.webhooks.resend(workspace, parseId(deliveryId));
  }
}
