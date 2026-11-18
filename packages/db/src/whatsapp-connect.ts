import { eq, sql } from 'drizzle-orm';
import { phoneNumbers, whatsappAccounts } from './schema/index.ts';
import type { Transaction } from './tenant.ts';

/**
 * Stores (or refreshes) a tenant's WhatsApp account and number (call inside withTenant).
 * An account or number already connected to another tenant is refused by RLS.
 */
export async function saveWhatsAppConnection(
  tx: Transaction,
  input: {
    tenantId: string;
    wabaId: string;
    onboardingType: 'coexistence' | 'cloud' | 'dev';
    accessTokenEnc: string;
    phone: {
      phoneNumberId: string;
      displayPhone: string;
      displayName: string | null;
      qualityRating: string | null;
    };
  },
): Promise<{ whatsappAccountId: string; phoneId: string }> {
  const [account] = await tx
    .insert(whatsappAccounts)
    .values({
      tenantId: input.tenantId,
      wabaId: input.wabaId,
      onboardingType: input.onboardingType,
      accessTokenEnc: input.accessTokenEnc,
    })
    .onConflictDoUpdate({
      target: whatsappAccounts.wabaId,
      set: {
        accessTokenEnc: input.accessTokenEnc,
        onboardingType: input.onboardingType,
        status: 'active',
      },
    })
    .returning({ id: whatsappAccounts.id });

  await tx
    .insert(phoneNumbers)
    .values({
      tenantId: input.tenantId,
      whatsappAccountId: account!.id,
      phoneNumberId: input.phone.phoneNumberId,
      displayPhone: input.phone.displayPhone,
      displayName: input.phone.displayName,
      qualityRating: input.phone.qualityRating,
      isCoexistence: input.onboardingType === 'coexistence',
    })
    .onConflictDoUpdate({
      target: phoneNumbers.phoneNumberId,
      set: {
        whatsappAccountId: account!.id,
        displayPhone: sql`excluded.display_phone`,
        displayName: sql`excluded.display_name`,
        qualityRating: sql`excluded.quality_rating`,
        isCoexistence: sql`excluded.is_coexistence`,
        status: 'active',
      },
    });

  const [saved] = await tx
    .select({ id: phoneNumbers.id })
    .from(phoneNumbers)
    .where(eq(phoneNumbers.phoneNumberId, input.phone.phoneNumberId));
  if (!saved) throw new Error('Phone number was not saved');
  return { whatsappAccountId: account!.id, phoneId: saved.id };
}
