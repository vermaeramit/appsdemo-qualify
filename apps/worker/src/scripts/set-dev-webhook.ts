// Points the Meta app's webhooks (WhatsApp messages + Page lead forms) at a (new) dev tunnel URL.
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
// One callback for both: WhatsApp messages (WABA, incl. Coexistence echoes) and lead forms (Page
// leadgen). If Meta refuses smb_message_echoes for this app, messages alone are subscribed.
for (const [object, fields, fallback] of [
  ['whatsapp_business_account', 'messages,smb_message_echoes', 'messages'],
  ['page', 'leadgen', null],
] as const) {
  const subscribe = (list: string) =>
    fetch(url, {
      method: 'POST',
      body: new URLSearchParams({
        object,
        callback_url: callbackUrl,
        verify_token: required('META_WEBHOOK_VERIFY_TOKEN'),
        fields: list,
        access_token: appToken,
      }),
    });
  let response = await subscribe(fields);
  let subscribed: string = fields;
  if (!response.ok && fallback) {
    console.warn(`• Meta refused "${fields}"; subscribing "${fallback}" only`);
    response = await subscribe(fallback);
    subscribed = fallback;
  }
  const result = (await response.json()) as { success?: boolean; error?: { message?: string } };
  if (!result.success) {
    console.error(
      `✗ Meta rejected the ${object} webhook: ${result.error?.message ?? response.status}`,
    );
    process.exit(1);
  }
  console.log(`✓ Webhook set to ${callbackUrl} (${object}: ${subscribed})`);
}
