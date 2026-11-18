import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { type DbHandle, eq, phoneNumbers, sql, withTenant } from '@qualify/db';
import { MetaApiError } from '@qualify/integrations';
import { type WhatsAppHealth, whatsappHealthSchema } from '@qualify/shared';
import { CurrentWorkspace, type WorkspaceContext, WorkspaceGuard } from '../auth/workspace.guard';
import { DB } from '../tokens';
import { WhatsAppAccessService } from './whatsapp-access.service';

const CACHE_MS = 60_000;
const BILLING_URL = 'https://business.facebook.com/billing_hub/payment_settings';
const managerUrl = (wabaId: string) =>
  `https://business.facebook.com/wa/manage/home/?waba_id=${encodeURIComponent(wabaId)}`;

/** Problems in the order a person should fix them. */
export function problemsOf(
  health: Omit<WhatsAppHealth, 'problems' | 'checkedAt' | 'connected' | 'links'>,
): string[] {
  const problems: string[] = [];
  if (health.paymentFailures24h > 0) {
    problems.push(
      `Meta refused ${health.paymentFailures24h} message(s) in the last 24 h because of a payment problem (131042). Check the payment method, credit line and tax details in Billing Hub.`,
    );
  }
  const number = health.number;
  if (number?.status && number.status !== 'CONNECTED') {
    problems.push(
      `The number's status is ${number.status}. Messages may not be delivered; check WhatsApp Manager.`,
    );
  }
  if (number?.qualityRating === 'RED') {
    problems.push(
      'Quality rating is low. Meta may lower the messaging limit; review templates and opt-outs.',
    );
  } else if (number?.qualityRating === 'YELLOW') {
    problems.push('Quality rating is medium. Watch blocks and reports from leads.');
  }
  if (number?.nameStatus && !['APPROVED', 'AVAILABLE_WITHOUT_REVIEW'].includes(number.nameStatus)) {
    problems.push(`Display name review: ${number.nameStatus}.`);
  }
  if (health.webhooksSubscribed === false) {
    problems.push(
      'Our app is not subscribed to this account’s webhooks, so replies will not arrive.',
    );
  }
  if (health.account?.reviewStatus && health.account.reviewStatus !== 'APPROVED') {
    problems.push(`WhatsApp account review: ${health.account.reviewStatus}.`);
  }
  return problems;
}

/** Live health of the connected WhatsApp number (Meta Graph API), cached for a minute. */
@Controller('whatsapp')
@UseGuards(WorkspaceGuard)
export class WhatsAppHealthController {
  private readonly cache = new Map<string, { at: number; value: WhatsAppHealth }>();

  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(WhatsAppAccessService) private readonly whatsapp: WhatsAppAccessService,
  ) {}

  @Get('health')
  async health(
    @CurrentWorkspace() workspace: WorkspaceContext,
    @Query('refresh') refresh?: string,
  ): Promise<WhatsAppHealth> {
    const cached = this.cache.get(workspace.tenantId);
    if (cached && !refresh && Date.now() - cached.at < CACHE_MS) return cached.value;

    const checkedAt = new Date().toISOString();
    const access = await this.whatsapp.forTenant(workspace.tenantId);
    if (!access.ok) {
      return whatsappHealthSchema.parse({
        connected: false,
        checkedAt,
        number: null,
        account: null,
        webhooksSubscribed: null,
        paymentFailures24h: 0,
        links: { whatsappManager: null, billing: BILLING_URL },
        problems: [access.reason],
      });
    }

    const [failures] = (
      await withTenant(this.handle.db, workspace.tenantId, (tx) =>
        tx.execute<{ total: number }>(sql`
          select count(*)::int as total from messages
          where status = 'failed' and created_at >= now() - interval '24 hours'
            and (error->'errors' @> '[{"code": 131042}]'::jsonb or error->>'code' = '131042')`),
      )
    ).rows;
    const paymentFailures24h = failures?.total ?? 0;
    const links = { whatsappManager: managerUrl(access.wabaId), billing: BILLING_URL };

    let value: WhatsAppHealth;
    try {
      const [phone, account, apps] = await Promise.all([
        access.client.getPhoneHealth(access.phoneNumberId),
        access.client.getWabaInfo(access.wabaId),
        access.client.listSubscribedApps(access.wabaId),
      ]);
      const partial = {
        number: {
          phoneNumberId: access.phoneNumberId,
          displayPhone: phone.display_phone_number ?? null,
          verifiedName: phone.verified_name ?? null,
          qualityRating: phone.quality_rating ?? null,
          status: phone.status ?? null,
          nameStatus: phone.name_status ?? null,
          messagingLimit: phone.whatsapp_business_manager_messaging_limit ?? null,
          throughput: phone.throughput?.level ?? null,
          platform: phone.platform_type ?? null,
        },
        account: {
          name: account.name ?? null,
          reviewStatus: account.account_review_status ?? null,
          businessVerification: account.business_verification_status ?? null,
        },
        webhooksSubscribed: apps.data.length > 0,
        paymentFailures24h,
      };
      value = whatsappHealthSchema.parse({
        connected: true,
        checkedAt,
        ...partial,
        links,
        problems: problemsOf(partial),
      });
      // Keep the stored rating current (the dashboard reads it).
      if (phone.quality_rating) {
        await withTenant(this.handle.db, workspace.tenantId, (tx) =>
          tx
            .update(phoneNumbers)
            .set({ qualityRating: phone.quality_rating })
            .where(eq(phoneNumbers.phoneNumberId, access.phoneNumberId)),
        );
      }
    } catch (error) {
      const tokenProblem =
        error instanceof MetaApiError && (error.code === 190 || error.status === 401);
      value = whatsappHealthSchema.parse({
        connected: true,
        checkedAt,
        number: null,
        account: null,
        webhooksSubscribed: null,
        paymentFailures24h,
        links,
        problems: [
          tokenProblem
            ? 'Meta rejected the access token (expired or revoked). Reconnect the number.'
            : `Meta did not answer the health check: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown error'}`,
        ],
      });
    }
    this.cache.set(workspace.tenantId, { at: Date.now(), value });
    return value;
  }
}
