import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { resolveFollowUps, resolveOpening } from '@qualify/core';
import { auditLogs, type DbHandle, getDefaultPublishedPlaybook, withTenant } from '@qualify/db';
import { type GraphTemplate, MetaApiError } from '@qualify/integrations';
import {
  type CreateTemplateRequest,
  type MessageTemplate,
  type TemplateList,
  templateListSchema,
} from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { DB } from '../tokens';
import { WhatsAppAccessService } from '../whatsapp/whatsapp-access.service';

/** Graph template → our shape, with where the AI agent uses it. */
export function toMessageTemplate(
  template: GraphTemplate,
  inUse: { opening: string | null; followup: string | null },
): MessageTemplate {
  const component = (type: string) => template.components?.find((item) => item.type === type);
  const header = component('HEADER');
  const usedFor: MessageTemplate['usedFor'] = [];
  if (template.name === inUse.opening) usedFor.push('opening');
  if (template.name === inUse.followup) usedFor.push('followup');
  const reason = template.rejected_reason;
  const score = template.quality_score?.score;
  return {
    id: template.id,
    name: template.name,
    language: template.language,
    category: template.category,
    status: template.status,
    headerFormat: header?.format ?? null,
    headerText: header?.text ?? null,
    bodyText: component('BODY')?.text ?? '',
    footerText: component('FOOTER')?.text ?? null,
    buttons: (component('BUTTONS')?.buttons ?? []).map((button) => ({
      type: button.type,
      text: button.text ?? '',
    })),
    rejectedReason: reason && reason !== 'NONE' ? reason : null,
    qualityScore: score && score !== 'UNKNOWN' ? score : null,
    usedFor,
  };
}

/** Message templates of the workspace's WhatsApp account (Templates page, M6). */
@Injectable()
export class TemplatesService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(WhatsAppAccessService) private readonly whatsapp: WhatsAppAccessService,
  ) {}

  async list(workspace: WorkspaceContext): Promise<TemplateList> {
    const access = await this.whatsapp.forTenant(workspace.tenantId);
    if (!access.ok) return { connected: false, reason: access.reason, templates: [] };
    const [templates, inUse] = await Promise.all([
      this.meta(() => access.client.listTemplates(access.wabaId)),
      this.inUse(workspace.tenantId),
    ]);
    return templateListSchema.parse({
      connected: true,
      reason: null,
      templates: templates
        .map((template) => toMessageTemplate(template, inUse))
        .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language)),
    });
  }

  async create(
    workspace: WorkspaceContext,
    input: CreateTemplateRequest,
  ): Promise<{ id: string; status: string; category: string }> {
    const access = await this.requireAccess(workspace.tenantId);
    const created = await this.meta(() =>
      access.client.createTemplate({
        wabaId: access.wabaId,
        name: input.name,
        language: input.language,
        category: input.category,
        bodyText: input.bodyText,
        bodyExample: input.examples,
        quickReplies: input.buttons,
        headerText: input.headerText,
        footerText: input.footerText,
      }),
    );
    await this.audit(workspace, 'template.created', input.name, {
      language: input.language,
      category: input.category,
    });
    return created;
  }

  async remove(workspace: WorkspaceContext, name: string): Promise<void> {
    const inUse = await this.inUse(workspace.tenantId);
    if (name === inUse.opening || name === inUse.followup) {
      throw new ConflictException(
        'The AI agent uses this template. Change the opening or follow-up first.',
      );
    }
    const access = await this.requireAccess(workspace.tenantId);
    await this.meta(() => access.client.deleteTemplate(access.wabaId, name));
    await this.audit(workspace, 'template.deleted', name, {});
  }

  private async inUse(tenantId: string) {
    const playbook = await withTenant(this.handle.db, tenantId, (tx) =>
      getDefaultPublishedPlaybook(tx),
    );
    return {
      opening: playbook ? (resolveOpening(playbook.config).templateName ?? null) : null,
      followup: playbook ? (resolveFollowUps(playbook.config).template.templateName ?? null) : null,
    };
  }

  private async requireAccess(tenantId: string) {
    const access = await this.whatsapp.forTenant(tenantId);
    if (!access.ok) throw new ServiceUnavailableException(access.reason);
    return access;
  }

  /** Meta's own error message is the useful one ("Template name already exists", …). */
  private async meta<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof MetaApiError) throw new BadRequestException(`Meta: ${error.message}`);
      throw error;
    }
  }

  private async audit(
    workspace: WorkspaceContext,
    action: string,
    target: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action,
        target,
        metadata,
      }),
    );
  }
}
