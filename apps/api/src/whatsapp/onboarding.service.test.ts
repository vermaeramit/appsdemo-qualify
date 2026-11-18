import { randomBytes } from 'node:crypto';
import type { DbHandle } from '@qualify/db';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceContext } from '../auth/workspace.guard';
import type { Env } from '../config/env';
import { OnboardingService } from './onboarding.service';

const env = {
  META_APP_ID: 'app',
  META_APP_SECRET: 'secret',
  META_ES_CONFIG_ID: 'config',
  ENCRYPTION_MASTER_KEY: randomBytes(32).toString('base64'),
} as unknown as Env;
const workspace = { tenantId: 'org_a', userId: 'user_1', role: 'owner' } as WorkspaceContext;

function setup(options: { syncFails?: boolean } = {}) {
  const tx = {
    execute: vi.fn(async () => ({ rows: [] })),
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
  };
  const handle = {
    db: { transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) },
  } as unknown as DbHandle;
  const client = {
    listPhoneNumbers: vi.fn(async () => ({
      data: [{ id: '111', display_phone_number: '+91 98000 00001', verified_name: 'Acme Tours' }],
    })),
    subscribeApp: vi.fn(async (_wabaId: string) => undefined),
    registerPhoneNumber: vi.fn(async (_phoneNumberId: string, _pin: string) => undefined),
    syncBusinessAppData: vi.fn(async (_phoneNumberId: string, _syncType: string) => {
      if (options.syncFails) throw new Error('window passed');
      return { request_id: 'req_1' };
    }),
  };
  const service = new OnboardingService(handle, env);
  service.graph = { exchange: vi.fn(async () => 'business-token'), client: () => client };
  const save = vi.fn(async () => ({ whatsappAccountId: 'wa', phoneId: 'ph' }));
  service.saveConnection = save;
  return { service, client, save };
}

describe('Embedded Signup onboarding', () => {
  it('connects a Coexistence number without registering it and requests both syncs', async () => {
    const { service, client, save } = setup();
    const result = await service.complete(workspace, {
      code: 'code-from-popup',
      mode: 'coexistence',
      wabaId: '22222',
    });
    expect(client.registerPhoneNumber).not.toHaveBeenCalled();
    expect(client.subscribeApp).toHaveBeenCalledWith('22222');
    expect(client.syncBusinessAppData.mock.calls.map((call) => call[1])).toEqual([
      'smb_app_state_sync',
      'history',
    ]);
    expect(save).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ wabaId: '22222', onboardingType: 'coexistence' }),
    );
    // The token is stored encrypted, never in plain text.
    const saved = (save.mock.calls[0] as unknown as [unknown, { accessTokenEnc: string }])[1];
    expect(saved.accessTokenEnc).not.toContain('business-token');
    expect(result).toMatchObject({ phoneNumberId: '111', displayPhone: '+91 98000 00001' });
    expect(result.steps.every((step) => step.ok)).toBe(true);
  });

  it('registers a Cloud API number with the PIN', async () => {
    const { service, client } = setup();
    await service.complete(workspace, {
      code: 'code-from-popup',
      mode: 'cloud',
      wabaId: '22222',
      phoneNumberId: '111',
      pin: '123456',
    });
    expect(client.registerPhoneNumber).toHaveBeenCalledWith('111', '123456');
    expect(client.syncBusinessAppData).not.toHaveBeenCalled();
  });

  it('keeps the connection when a history sync is refused', async () => {
    const { service, save } = setup({ syncFails: true });
    const result = await service.complete(workspace, {
      code: 'code-from-popup',
      mode: 'coexistence',
      wabaId: '22222',
    });
    expect(save).toHaveBeenCalled();
    expect(result.steps.filter((step) => !step.ok).map((step) => step.name)).toEqual([
      'Contacts sync requested',
      'Chat history sync requested',
    ]);
  });
});
