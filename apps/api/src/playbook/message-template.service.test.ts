import {
  followUpTemplateName,
  openingTemplateName,
  resolveOpening,
  travelPlaybookTemplate,
} from '@qualify/core';
import type { DbHandle } from '@qualify/db';
import type { WhatsAppClient } from '@qualify/integrations';
import type { PlaybookConfig, PlaybookResponse } from '@qualify/shared';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from '../auth/workspace.guard';
import type { WhatsAppAccess, WhatsAppAccessService } from '../whatsapp/whatsapp-access.service';
import type { TemplateMediaService } from '../media/template-media.service';
import { MessageTemplateService } from './message-template.service';
import type { PlaybookService } from './playbook.service';

const workspace: WorkspaceContext = { tenantId: 't1', userId: 'u1', role: 'owner' };

type Template = { name: string; status: string; language: string; rejected_reason?: string };

/** The service with an in-memory playbook, a fake Meta client and a no-op audit transaction. */
function setup(options: { templates?: Template[]; connected?: boolean } = {}) {
  let config: PlaybookConfig = travelPlaybookTemplate('Sunrise Holidays');
  let versionNo = 1;
  const templates = options.templates ?? [];

  const playbooks = {
    get: vi.fn(async (): Promise<PlaybookResponse> => ({
      playbookId: '00000000-0000-4000-8000-000000000001',
      versionId: '00000000-0000-4000-8000-000000000002',
      versionNo,
      config,
    })),
    publish: vi.fn(async (_workspace: WorkspaceContext, next: PlaybookConfig) => {
      config = next;
      versionNo += 1;
      return { playbookId: '', versionId: '', versionNo, config };
    }),
  };

  const client = {
    findTemplates: vi.fn(async (_wabaId: string, name: string) => ({
      data: templates
        .filter((template) => template.name.startsWith(name))
        .map((template) => ({ id: '1', category: 'MARKETING', ...template })),
    })),
    createTemplate: vi.fn(async (params: { name: string; language: string }) => {
      templates.push({ name: params.name, language: params.language, status: 'PENDING' });
      return { id: '1', status: 'PENDING', category: 'MARKETING' };
    }),
  };
  const access: WhatsAppAccess =
    options.connected === false
      ? { ok: false, reason: 'No WhatsApp number is connected yet.' }
      : {
          ok: true,
          client: client as unknown as WhatsAppClient,
          wabaId: 'waba1',
          phoneNumberId: 'pn1',
          accessToken: 'token',
        };
  const whatsapp = { forTenant: vi.fn(async () => access) };

  const tx = { execute: vi.fn(), insert: () => ({ values: vi.fn() }) };
  const handle = {
    db: { transaction: (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) },
  } as unknown as DbHandle;

  const service = new MessageTemplateService(
    handle,
    playbooks as unknown as PlaybookService,
    whatsapp as unknown as WhatsAppAccessService,
    {
      sampleHandle: vi.fn(async () => ({ format: 'IMAGE', handle: '4::h' })),
    } as unknown as TemplateMediaService,
  );
  return { service, client, playbooks, templates, getConfig: () => config };
}

describe('MessageTemplateService', () => {
  const expectedName = openingTemplateName(
    resolveOpening(travelPlaybookTemplate('Sunrise Holidays')),
  );

  it('reports not connected without a WhatsApp number', async () => {
    const { service } = setup({ connected: false });
    const status = await service.status('t1', 'opening');
    expect(status.state).toBe('not_connected');
    expect(status.message).toContain('No WhatsApp number');
  });

  it('submits the published text once, under a name derived from it', async () => {
    const { service, client } = setup();
    expect((await service.status('t1', 'opening')).state).toBe('not_submitted');

    const status = await service.submit(workspace, 'opening');
    expect(status).toMatchObject({ name: expectedName, state: 'pending', active: false });
    expect(client.createTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: expectedName,
        category: 'MARKETING',
        bodyExample: ['Rahul', 'Sunrise Holidays'],
        quickReplies: ['Yes, sure', 'Not now'],
      }),
    );

    // Submitting again doesn't create a duplicate.
    await service.submit(workspace, 'opening');
    expect(client.createTemplate).toHaveBeenCalledTimes(1);
  });

  it('refuses to resubmit a rejected text', async () => {
    const { service } = setup({
      templates: [
        { name: expectedName, status: 'REJECTED', language: 'en', rejected_reason: 'PROMOTIONAL' },
      ],
    });
    expect(await service.status('t1', 'opening')).toMatchObject({
      state: 'rejected',
      rejectedReason: 'PROMOTIONAL',
    });
    await expect(service.submit(workspace, 'opening')).rejects.toThrow(/Meta rejected this text/);
  });

  it('activates an approved template by publishing it in the playbook', async () => {
    const { service, playbooks, getConfig } = setup({
      templates: [{ name: expectedName, status: 'APPROVED', language: 'en' }],
    });
    expect(await service.status('t1', 'opening')).toMatchObject({
      state: 'approved',
      active: false,
    });

    const status = await service.activate(workspace, 'opening');
    expect(status.active).toBe(true);
    expect(getConfig().opening?.templateName).toBe(expectedName);
    expect(playbooks.publish).toHaveBeenCalledTimes(1);

    // Already active: nothing to do.
    await service.activate(workspace, 'opening');
    expect(playbooks.publish).toHaveBeenCalledTimes(1);
  });

  it('does not activate a template that is still in review', async () => {
    const { service } = setup({
      templates: [{ name: expectedName, status: 'PENDING', language: 'en' }],
    });
    await expect(service.activate(workspace, 'opening')).rejects.toThrow(/not approved/);
  });

  it('handles the follow-up template the same way, stored under followUps', async () => {
    const followName = followUpTemplateName(
      travelPlaybookTemplate('Sunrise Holidays').followUps!.template,
    );
    const { service, client, getConfig } = setup({
      templates: [{ name: followName, status: 'APPROVED', language: 'en' }],
    });
    expect(await service.status('t1', 'followup')).toMatchObject({
      name: followName,
      state: 'approved',
      active: false,
    });
    await service.activate(workspace, 'followup');
    expect(getConfig().followUps?.template.templateName).toBe(followName);
    expect(getConfig().opening?.templateName ?? null).toBeNull();
    expect(client.createTemplate).not.toHaveBeenCalled();
  });
});
