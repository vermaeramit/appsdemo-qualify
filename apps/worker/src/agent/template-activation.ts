import {
  followUpTemplateName,
  openingTemplateName,
  resolveFollowUps,
  resolveOpening,
} from '@qualify/core';
import {
  type Database,
  getLatestPublishedVersion,
  publishPlaybookVersion,
  withTenant,
} from '@qualify/db';
import type { WhatsAppClient } from '@qualify/integrations';
import type { PlaybookConfig, PlaybookOpening } from '@qualify/shared';

/**
 * Approved templates switch on by themselves (D-096). Business-initiated messages (the opening,
 * template follow-ups) need an approved Meta template; its name is derived from the text. When
 * none is switched on for the agent, the worker asks Meta about that name: approved → it is
 * switched on (a new published version, like "Use this template") and used; otherwise the lead
 * gets nothing and the log says exactly why.
 */
export type TemplateKind = 'opening' | 'followup';

export type TemplateLookupClient = Pick<WhatsAppClient, 'findTemplates'>;

export type TemplateCheck =
  | { state: 'approved'; name: string; language: string }
  | {
      state: 'not_submitted' | 'pending' | 'rejected' | 'paused' | 'disabled' | 'unchecked';
      name: string;
      reason: string | null;
    };

const STATES: Record<string, TemplateCheck['state']> = {
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

const LABEL: Record<TemplateKind, { name: string; card: string }> = {
  opening: { name: 'opening', card: 'AI agents → Opening message' },
  followup: { name: 'follow-up', card: 'AI agents → Follow-ups' },
};

function templateNameFor(kind: TemplateKind, message: PlaybookOpening): string {
  return kind === 'opening' ? openingTemplateName(message) : followUpTemplateName(message);
}

function messageOf(kind: TemplateKind, config: PlaybookConfig): PlaybookOpening {
  return kind === 'opening' ? resolveOpening(config) : resolveFollowUps(config).template;
}

function withMessage(
  kind: TemplateKind,
  config: PlaybookConfig,
  message: PlaybookOpening,
): PlaybookConfig {
  return kind === 'opening'
    ? { ...config, opening: message }
    : { ...config, followUps: { ...resolveFollowUps(config), template: message } };
}

/** Meta's review state of the template behind this text. */
export async function checkTemplate(
  client: Partial<TemplateLookupClient>,
  wabaId: string,
  kind: TemplateKind,
  message: PlaybookOpening,
): Promise<TemplateCheck> {
  const name = templateNameFor(kind, message);
  if (!client.findTemplates) return { state: 'unchecked', name, reason: 'no template lookup' };
  let found;
  try {
    found = await client.findTemplates(wabaId, name);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { state: 'unchecked', name, reason: reason.slice(0, 200) };
  }
  const exact = found.data.filter((template) => template.name === name);
  const template =
    exact.find((candidate) => candidate.language === message.templateLanguage) ?? exact[0];
  if (!template) return { state: 'not_submitted', name, reason: null };
  const state = STATES[template.status] ?? 'pending';
  if (state === 'approved') return { state, name, language: template.language };
  const reason =
    template.rejected_reason && template.rejected_reason !== 'NONE'
      ? template.rejected_reason
      : null;
  return { state, name, reason };
}

/** Why a business-initiated message can't go out yet, in plain words. */
export function templateNotReadyReason(
  kind: TemplateKind,
  check: Exclude<TemplateCheck, { state: 'approved' }>,
): string {
  const { name, card } = LABEL[kind];
  switch (check.state) {
    case 'not_submitted':
      return `the ${name} template hasn't been submitted to Meta yet (${card} → Submit to Meta)`;
    case 'pending':
      return `the ${name} template "${check.name}" is still in review at Meta`;
    case 'rejected':
      return `Meta rejected the ${name} template "${check.name}"${check.reason ? ` (${check.reason})` : ''}: change the text and submit it again`;
    case 'paused':
      return `Meta paused the ${name} template "${check.name}"`;
    case 'disabled':
      return `Meta disabled the ${name} template "${check.name}"`;
    case 'unchecked':
      return `couldn't check the ${name} template with Meta${check.reason ? ` (${check.reason})` : ''}`;
  }
}

/**
 * Switches on an approved template for the agent: a new published version with the template
 * name, unless the latest version already has it or its text has changed since.
 */
export async function activateTemplate(
  db: Database,
  input: {
    tenantId: string;
    playbookId: string;
    kind: TemplateKind;
    name: string;
    language: string;
  },
): Promise<boolean> {
  return withTenant(db, input.tenantId, async (tx) => {
    const latest = await getLatestPublishedVersion(tx, input.playbookId);
    if (!latest) return false;
    const message = messageOf(input.kind, latest.config);
    if (message.templateName === input.name) return false;
    if (templateNameFor(input.kind, message) !== input.name) return false;
    await publishPlaybookVersion(tx, {
      tenantId: input.tenantId,
      playbookId: input.playbookId,
      config: withMessage(input.kind, latest.config, {
        ...message,
        templateName: input.name,
        templateLanguage: input.language,
      }),
    });
    return true;
  });
}
