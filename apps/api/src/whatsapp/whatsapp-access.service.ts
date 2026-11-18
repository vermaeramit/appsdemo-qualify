import { Inject, Injectable } from '@nestjs/common';
import { type DbHandle, eq, phoneNumbers, whatsappAccounts, withTenant } from '@qualify/db';
import { decryptSecret, parseMasterKey, WhatsAppClient } from '@qualify/integrations';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

export type WhatsAppAccess =
  | { ok: true; client: WhatsAppClient; wabaId: string; phoneNumberId: string }
  | { ok: false; reason: string };

/** A Graph API client for the tenant's connected WhatsApp account (token decrypted on demand). */
@Injectable()
export class WhatsAppAccessService {
  private readonly masterKey: Buffer | null;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
  }

  async forTenant(tenantId: string): Promise<WhatsAppAccess> {
    if (!this.masterKey) {
      return { ok: false, reason: 'ENCRYPTION_MASTER_KEY is not set on the server.' };
    }
    const [account] = await withTenant(this.handle.db, tenantId, (tx) =>
      tx
        .select({
          wabaId: whatsappAccounts.wabaId,
          accessTokenEnc: whatsappAccounts.accessTokenEnc,
          phoneNumberId: phoneNumbers.phoneNumberId,
        })
        .from(phoneNumbers)
        .innerJoin(whatsappAccounts, eq(phoneNumbers.whatsappAccountId, whatsappAccounts.id))
        .where(eq(phoneNumbers.status, 'active'))
        .limit(1),
    );
    if (!account) return { ok: false, reason: 'No WhatsApp number is connected yet.' };

    const client = new WhatsAppClient({
      accessToken: decryptSecret(account.accessTokenEnc, this.masterKey),
      ...(this.env.META_GRAPH_VERSION ? { graphVersion: this.env.META_GRAPH_VERSION } : {}),
    });
    return { ok: true, client, wabaId: account.wabaId, phoneNumberId: account.phoneNumberId };
  }
}
