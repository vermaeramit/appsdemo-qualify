// Connects our own development WhatsApp number (D-034) to a workspace.
//   pnpm --filter @qualify/worker connect-dev-number [workspace-slug]
// Production tenants connect through Embedded Signup instead (M6).
import {
  createDb,
  eq,
  organization,
  phoneNumbers,
  sql,
  whatsappAccounts,
  withTenant,
} from '@qualify/db';
import { encryptSecret, parseMasterKey, WhatsAppClient } from '@qualify/integrations';

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`✗ ${name} is not set in .env (see docs/META_SETUP.md)`);
    process.exit(1);
  }
  return value;
}

const phoneNumberId = required('WHATSAPP_DEV_PHONE_NUMBER_ID');
const wabaId = required('WHATSAPP_DEV_WABA_ID');
const token = required('WHATSAPP_SYSTEM_USER_TOKEN');
const masterKey = parseMasterKey(required('ENCRYPTION_MASTER_KEY'));
const { db, pool } = createDb(required('APP_DATABASE_URL'), { max: 2 });
const client = new WhatsAppClient({
  accessToken: token,
  ...(process.env.META_GRAPH_VERSION ? { graphVersion: process.env.META_GRAPH_VERSION } : {}),
});

try {
  // 1. Pick the workspace.
  const slug = process.argv[2];
  const workspaces = await db
    .select({ id: organization.id, name: organization.name, slug: organization.slug })
    .from(organization);
  const workspace = slug
    ? workspaces.find((candidate) => candidate.slug === slug)
    : workspaces.length === 1
      ? workspaces[0]
      : undefined;
  if (!workspace) {
    console.error(
      workspaces.length === 0
        ? '✗ No workspace yet. Sign up at http://localhost:5173 and create one first.'
        : `✗ Pass the workspace slug. Available: ${workspaces.map((w) => w.slug).join(', ')}`,
    );
    process.exit(1);
  }

  // 2. Validate the token and number with Meta.
  const info = await client.getPhoneNumber(phoneNumberId);
  console.log(`✓ Meta number: ${info.display_phone_number} (${info.verified_name ?? 'no name'})`);
  console.log(
    `  quality: ${info.quality_rating ?? 'n/a'}, platform: ${info.platform_type ?? 'n/a'}`,
  );

  // 3. Make sure our app receives this WABA's webhooks, and show any other subscribed apps.
  const before = await client.listSubscribedApps(wabaId);
  console.log(`  apps subscribed to the WABA before: ${JSON.stringify(before.data)}`);
  await client.subscribeApp(wabaId);
  const after = await client.listSubscribedApps(wabaId);
  console.log(`✓ apps subscribed to the WABA now: ${JSON.stringify(after.data)}`);

  // 4. Store the account + number in the workspace (token encrypted).
  await withTenant(db, workspace.id, async (tx) => {
    const [account] = await tx
      .insert(whatsappAccounts)
      .values({
        tenantId: workspace.id,
        wabaId,
        onboardingType: 'dev',
        accessTokenEnc: encryptSecret(token, masterKey),
      })
      .onConflictDoUpdate({
        target: whatsappAccounts.wabaId,
        set: { accessTokenEnc: encryptSecret(token, masterKey), status: 'active' },
      })
      .returning({ id: whatsappAccounts.id });

    await tx
      .insert(phoneNumbers)
      .values({
        tenantId: workspace.id,
        whatsappAccountId: account!.id,
        phoneNumberId,
        displayPhone: info.display_phone_number,
        displayName: info.verified_name ?? null,
        qualityRating: info.quality_rating ?? null,
      })
      .onConflictDoUpdate({
        target: phoneNumbers.phoneNumberId,
        set: {
          displayPhone: sql`excluded.display_phone`,
          displayName: sql`excluded.display_name`,
          qualityRating: sql`excluded.quality_rating`,
          status: 'active',
        },
      });

    const [saved] = await tx
      .select({ id: phoneNumbers.id })
      .from(phoneNumbers)
      .where(eq(phoneNumbers.phoneNumberId, phoneNumberId));
    if (!saved) throw new Error('Phone number was not saved');
  });

  console.log(`✓ Connected ${info.display_phone_number} to workspace "${workspace.name}"`);
} catch (error) {
  console.error('✗ Failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
