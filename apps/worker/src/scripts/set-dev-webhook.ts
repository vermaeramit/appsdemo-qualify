// Points the Meta app's WhatsApp webhook at a (new) dev tunnel URL.
//   pnpm --filter @qualify/worker set-dev-webhook https://<name>.trycloudflare.com
// Quick-tunnel URLs change on every restart, so run this after starting cloudflared.

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    console.error(`✗ ${name} is not set in .env (see docs/META_SETUP.md)`);
    process.exit(1);
  }
  return value;
}

const base = process.argv[2]?.replace(/\/+$/, '');
if (!base?.startsWith('https://')) {
  console.error('✗ Usage: set-dev-webhook https://<tunnel-host>');
  process.exit(1);
}

const appId = required('META_APP_ID');
const appToken = `${appId}|${required('META_APP_SECRET')}`;
const url = `https://graph.facebook.com/${process.env.META_GRAPH_VERSION ?? 'v24.0'}/${appId}/subscriptions`;
const callbackUrl = `${base}/api/webhooks/meta`;

// Meta calls the callback (GET handshake) before saving, so the dev stack must be running.
const response = await fetch(url, {
  method: 'POST',
  body: new URLSearchParams({
    object: 'whatsapp_business_account',
    callback_url: callbackUrl,
    verify_token: required('META_WEBHOOK_VERIFY_TOKEN'),
    fields: 'messages',
    access_token: appToken,
  }),
});
const result = (await response.json()) as { success?: boolean; error?: { message?: string } };
if (!result.success) {
  console.error(`✗ Meta rejected the webhook: ${result.error?.message ?? response.status}`);
  process.exit(1);
}
console.log(`✓ Webhook set to ${callbackUrl} (field: messages)`);
