import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { openingExampleParams, openingTemplateName, resolveOpening } from '@qualify/core';
import { auditLogs, type DbHandle, withTenant } from '@qualify/db';
import { MetaApiError } from '@qualify/integrations';
import type { OpeningTemplateState, OpeningTemplateStatus } from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { DB } from '../tokens';
import { type WhatsAppAccess, WhatsAppAccessService } from '../whatsapp/whatsapp-access.service';
import { PlaybookService } from './playbook.service';

const STATES: Record<string, OpeningTemplateState> = {
  APPROVED: 'approved',
  PENDING: 'pending',
  IN_APPEAL: 'pending',
  REJECTED: 'rejected',
  PAUSED: 'paused',
  DISABLED: 'disabled',
  PENDING_DELETION: 'disabled',
  DELETED: 'disabled',
  ARCHIVED: 'disabled',
};

type Connected = Extract<WhatsAppAccess, { ok: true }>;

/**
 * The approved template behind the opening message (business-initiated chats need one).
 * Its name is derived from the published opening text, so every text gets its own review.
 */
@Injectable()
export class OpeningTemplateService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PlaybookService) private readonly playbooks: PlaybookService,
    @Inject(WhatsAppAccessService) private readonly whatsapp: WhatsAppAccessService,
  ) {}

  async status(tenantId: string): Promise<OpeningTemplateStatus> {
    const { opening } = await this.current(tenantId);
    const name = opening.templateName ?? openingTemplateName(opening);
    const base = {
      name,
      language: opening.templateLanguage,
      active: false,
      rejectedReason: null,
      message: null,
    };
    const access = await this.whatsapp.forTenant(tenantId);
    if (!access.ok) return { ...base, state: 'not_connected', message: access.reason };

    const template = await this.find(access, name, opening.templateLanguage);
    if (!template) return { ...base, state: 'not_submitted' };
    const state = STATES[template.status] ?? 'pending';
    const reason = template.rejected_reason;
    return {
      ...base,
      state,
      active: opening.templateName === name && state === 'approved',
      rejectedReason: state === 'rejected' && reason && reason !== 'NONE' ? reason : null,
    };
  }

  /** Submits the published opening text to Meta for review. Safe to call twice. */
  async submit(workspace: WorkspaceContext): Promise<OpeningTemplateStatus> {
    const { config, opening } = await this.current(workspace.tenantId);
    if (opening.templateName) return this.status(workspace.tenantId);
    const access = await this.requireAccess(workspace.tenantId);
    const name = openingTemplateName(opening);

    const existing = await this.find(access, name, opening.templateLanguage);
    if (existing?.status === 'REJECTED') {
      throw new BadRequestException(
        'Meta rejected this text. Change the opening text, publish, and submit again.',
      );
    }
    if (!existing) {
      await this.meta(() =>
        access.client.createTemplate({
          wabaId: access.wabaId,
          name,
          language: opening.templateLanguage,
          category: 'MARKETING',
          bodyText: opening.bodyText,
          bodyExample: openingExampleParams(opening, config.business.name),
          quickReplies: opening.buttons,
        }),
      );
      await this.audit(workspace, 'opening_template.submitted', name);
    }
    return this.status(workspace.tenantId);
  }

  /** Uses the approved template for openings (publishes a new playbook version). */
  async activate(workspace: WorkspaceContext): Promise<OpeningTemplateStatus> {
    const { config, opening } = await this.current(workspace.tenantId);
    const status = await this.status(workspace.tenantId);
    if (status.active) return status;
    if (status.state !== 'approved') {
      throw new BadRequestException('The template is not approved yet.');
    }
    await this.playbooks.publish(workspace, {
      ...config,
      opening: { ...opening, templateName: status.name, templateLanguage: status.language },
    });
    await this.audit(workspace, 'opening_template.activated', status.name);
    return this.status(workspace.tenantId);
  }

  private async current(tenantId: string) {
    const playbook = await this.playbooks.get(tenantId);
    return { config: playbook.config, opening: resolveOpening(playbook.config) };
  }

  private async requireAccess(tenantId: string): Promise<Connected> {
    const access = await this.whatsapp.forTenant(tenantId);
    if (!access.ok) throw new BadRequestException(access.reason);
    return access;
  }

  private async find(access: Connected, name: string, language: string) {
    const found = await this.meta(() => access.client.findTemplates(access.wabaId, name));
    const exact = found.data.filter((template) => template.name === name);
    return exact.find((template) => template.language === language) ?? exact[0] ?? null;
  }

  /** Meta errors become a readable 422 for the dashboard. */
  private async meta<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call();
    } catch (error) {
      if (error instanceof MetaApiError) {
        throw new UnprocessableEntityException(`WhatsApp (Meta): ${error.message}`);
      }
      throw error;
    }
  }

  private async audit(workspace: WorkspaceContext, action: string, name: string): Promise<void> {
    await withTenant(this.handle.db, workspace.tenantId, (tx) =>
      tx.insert(auditLogs).values({
        tenantId: workspace.tenantId,
        actorUserId: workspace.userId,
        action,
        target: name,
        metadata: {},
      }),
    );
  }
}
