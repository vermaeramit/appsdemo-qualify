import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { auditLogs, type DbHandle, saveWhatsAppConnection, withTenant } from '@qualify/db';
import {
  DEFAULT_GRAPH_VERSION,
  encryptSecret,
  exchangeSignupCode,
  MetaApiError,
  parseMasterKey,
  WhatsAppClient,
} from '@qualify/integrations';
import {
  type CompleteSignup,
  type SignupConfig,
  type SignupResult,
  signupResultSchema,
} from '@qualify/shared';
import type { WorkspaceContext } from '../auth/workspace.guard';
import type { Env } from '../config/env';
import { DB, ENV } from '../tokens';

type Step = SignupResult['steps'][number];

/** The Graph calls onboarding makes (a fake in tests). */
export interface OnboardingGraph {
  exchange(code: string): Promise<string>;
  client(
    token: string,
  ): Pick<
    WhatsAppClient,
    'listPhoneNumbers' | 'subscribeApp' | 'registerPhoneNumber' | 'syncBusinessAppData'
  >;
}

const message = (error: unknown) =>
  error instanceof Error ? error.message.slice(0, 300) : 'Unknown error';

/**
 * Embedded Signup v4 (M6, D-081): the customer connects their own WhatsApp account from the
 * dashboard. Code → business token, subscribe our app to their account, then either register a
 * Cloud API number (PIN) or, for Coexistence, ask Meta to sync contacts and message history
 * (allowed once, within 24 h). The token is stored encrypted.
 */
@Injectable()
export class OnboardingService {
  private readonly masterKey: Buffer | null;
  graph: OnboardingGraph;
  /** Replaced in tests. */
  saveConnection = saveWhatsAppConnection;

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(ENV) private readonly env: Env,
  ) {
    this.masterKey = env.ENCRYPTION_MASTER_KEY ? parseMasterKey(env.ENCRYPTION_MASTER_KEY) : null;
    const graphVersion = env.META_GRAPH_VERSION;
    this.graph = {
      exchange: (code) =>
        exchangeSignupCode({
          appId: env.META_APP_ID ?? '',
          appSecret: env.META_APP_SECRET ?? '',
          code,
          ...(graphVersion ? { graphVersion } : {}),
        }),
      client: (token) =>
        new WhatsAppClient({ accessToken: token, ...(graphVersion ? { graphVersion } : {}) }),
    };
  }

  config(): SignupConfig {
    const enabled = Boolean(
      this.env.META_APP_ID && this.env.META_ES_CONFIG_ID && this.env.META_APP_SECRET,
    );
    return {
      enabled,
      appId: enabled ? (this.env.META_APP_ID ?? null) : null,
      configId: enabled ? (this.env.META_ES_CONFIG_ID ?? null) : null,
      graphVersion: this.env.META_GRAPH_VERSION ?? DEFAULT_GRAPH_VERSION,
    };
  }

  async complete(workspace: WorkspaceContext, input: CompleteSignup): Promise<SignupResult> {
    if (!this.config().enabled || !this.masterKey) {
      throw new ServiceUnavailableException('WhatsApp sign-up is not configured on the server.');
    }
    const steps: Step[] = [];

    let token: string;
    try {
      token = await this.graph.exchange(input.code);
      steps.push({ name: 'Access granted', ok: true, detail: null });
    } catch (error) {
      throw new BadRequestException(
        `Meta did not accept the sign-up (the code lasts 5 minutes): ${message(error)}`,
      );
    }
    const client = this.graph.client(token);

    const numbers = (await client.listPhoneNumbers(input.wabaId)).data;
    const number = input.phoneNumberId
      ? numbers.find((candidate) => candidate.id === input.phoneNumberId)
      : numbers[0];
    if (!number) {
      throw new BadRequestException('No phone number was found in the connected WhatsApp account.');
    }

    try {
      await client.subscribeApp(input.wabaId);
      steps.push({ name: 'Webhooks subscribed', ok: true, detail: null });
    } catch (error) {
      throw new BadRequestException(`Could not subscribe to the account: ${message(error)}`);
    }

    if (input.mode === 'cloud') {
      try {
        await client.registerPhoneNumber(number.id, input.pin!);
        steps.push({ name: 'Number registered', ok: true, detail: null });
      } catch (error) {
        throw new BadRequestException(`Could not register the number: ${message(error)}`);
      }
    }

    try {
      await withTenant(this.handle.db, workspace.tenantId, async (tx) => {
        await this.saveConnection(tx, {
          tenantId: workspace.tenantId,
          wabaId: input.wabaId,
          onboardingType: input.mode,
          accessTokenEnc: encryptSecret(token, this.masterKey!),
          phone: {
            phoneNumberId: number.id,
            displayPhone: number.display_phone_number,
            displayName: number.verified_name ?? null,
            qualityRating: number.quality_rating ?? null,
          },
        });
        await tx.insert(auditLogs).values({
          tenantId: workspace.tenantId,
          actorUserId: workspace.userId,
          action: 'whatsapp.connected',
          target: number.id,
          metadata: { wabaId: input.wabaId, mode: input.mode },
        });
      });
      steps.push({ name: 'Saved to this workspace', ok: true, detail: null });
    } catch (error) {
      if (/row-level security|duplicate key/i.test(message(error))) {
        throw new ConflictException(
          'This WhatsApp account is already connected to another workspace.',
        );
      }
      throw error;
    }

    // Coexistence: contacts and history can be requested once, within 24 h. Not blocking.
    if (input.mode === 'coexistence') {
      for (const [syncType, name] of [
        ['smb_app_state_sync', 'Contacts sync requested'],
        ['history', 'Chat history sync requested'],
      ] as const) {
        try {
          const result = await client.syncBusinessAppData(number.id, syncType);
          steps.push({ name, ok: true, detail: result.request_id ?? null });
        } catch (error) {
          steps.push({
            name,
            ok: false,
            detail: error instanceof MetaApiError ? error.message.slice(0, 200) : message(error),
          });
        }
      }
    }

    return signupResultSchema.parse({
      phoneNumberId: number.id,
      displayPhone: number.display_phone_number,
      verifiedName: number.verified_name ?? null,
      mode: input.mode,
      steps,
    });
  }
}
