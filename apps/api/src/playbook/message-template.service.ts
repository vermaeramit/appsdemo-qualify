import {
  BadRequestException,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  followUpTemplateName,
  openingExampleParams,
  openingTemplateName,
  resolveFollowUps,
  resolveOpening,
} from '@qualify/core';
import { auditLogs, type DbHandle, withTenant } from '@qualify/db';
import { MetaApiError } from '@qualify/integrations';
import type {
  OpeningTemplateState,
  OpeningTemplateStatus,
  PlaybookConfig,
  PlaybookOpening,
} from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import { DB } from '../tokens';
import { type WhatsAppAccess, WhatsAppAccessService } from '../whatsapp/whatsapp-access.service';
import { PlaybookService } from './playbook.service';

/** The playbook's business-initiated messages that need an approved Meta template. */
export type TemplateKind = 'opening' | 'followup';

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

/** Where each kind lives in the config, its template name, and how to store an approval. */
const KINDS: Record<
  TemplateKind,
  {
    read: (config: PlaybookConfig) => PlaybookOpening;
    name: (message: PlaybookOpening) => string;
    write: (config: PlaybookConfig, message: PlaybookOpening) => PlaybookConfig;
  }
> = {
  opening: {
    read: resolveOpening,
    name: openingTemplateName,
    write: (config, message) => ({ ...config, opening: message }),
  },
  followup: {
    read: (config) => resolveFollowUps(config).template,
    name: followUpTemplateName,
    write: (config, message) => ({
      ...config,
      followUps: { ...resolveFollowUps(config), template: message },
    }),
  },
};

/**
 * Approved templates behind the opening and follow-up messages (business-initiated chats need
 * one). Each name is derived from the published text, so every text gets its own review.
 */
@Injectable()
export class MessageTemplateService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(PlaybookService) private readonly playbooks: PlaybookService,
    @Inject(WhatsAppAccessService) private readonly whatsapp: WhatsAppAccessService,
  ) {}

  async status(tenantId: string, kind: TemplateKind): Promise<OpeningTemplateStatus> {
    const { message } = await this.current(tenantId, kind);
    const name = message.templateName ?? KINDS[kind].name(message);
    const base = {
      name,
      language: message.templateLanguage,
      active: false,
      rejectedReason: null,
      message: null,
    };
    const access = await this.whatsapp.forTenant(tenantId);
    if (!access.ok) return { ...base, state: 'not_connected', message: access.reason };

    const template = await this.find(access, name, message.templateLanguage);
    if (!template) return { ...base, state: 'not_submitted' };
    const state = STATES[template.status] ?? 'pending';
    const reason = template.rejected_reason;
    return {
      ...base,
      state,
      active: message.templateName === name && state === 'approved',
      rejectedReason: state === 'rejected' && reason && reason !== 'NONE' ? reason : null,
    };
  }

  /** Submits the published text to Meta for review. Safe to call twice. */
  async submit(workspace: WorkspaceContext, kind: TemplateKind): Promise<OpeningTemplateStatus> {
    const { config, message } = await this.current(workspace.tenantId, kind);
    if (message.templateName) return this.status(workspace.tenantId, kind);
    const access = await this.requireAccess(workspace.tenantId);
    const name = KINDS[kind].name(message);

    const existing = await this.find(access, name, message.templateLanguage);
    if (existing?.status === 'REJECTED') {
      throw new BadRequestException(
        'Meta rejected this text. Change the text, publish, and submit again.',
      );
    }
    if (!existing) {
      await this.meta(() =>
        access.client.createTemplate({
          wabaId: access.wabaId,
          name,
          language: message.templateLanguage,
          category: 'MARKETING',
          bodyText: message.bodyText,
          bodyExample: openingExampleParams(message, config.business.name),
          quickReplies: message.buttons,
        }),
      );
      await this.audit(workspace, `${kind}_template.submitted`, name);
    }
    return this.status(workspace.tenantId, kind);
  }

  /** Uses the approved template (publishes a new playbook version). */
  async activate(workspace: WorkspaceContext, kind: TemplateKind): Promise<OpeningTemplateStatus> {
    const { config, message } = await this.current(workspace.tenantId, kind);
    const status = await this.status(workspace.tenantId, kind);
    if (status.active) return status;
    if (status.state !== 'approved') {
      throw new BadRequestException('The template is not approved yet.');
    }
    await this.playbooks.publish(
      workspace,
      KINDS[kind].write(config, {
        ...message,
        templateName: status.name,
        templateLanguage: status.language,
      }),
    );
    await this.audit(workspace, `${kind}_template.activated`, status.name);
    return this.status(workspace.tenantId, kind);
  }

  private async current(tenantId: string, kind: TemplateKind) {
    const playbook = await this.playbooks.get(tenantId);
    return { config: playbook.config, message: KINDS[kind].read(playbook.config) };
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
