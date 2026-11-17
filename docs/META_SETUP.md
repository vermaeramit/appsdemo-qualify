# Meta / WhatsApp setup for local development

Where to find each value for `.env` (M2). Put them only in `.env`. Never commit them or paste them in chat.

| `.env` key | Where it comes from |
|---|---|
| `META_APP_ID` | developers.facebook.com → My Apps → **AppsDemo Qualify** → App settings → **Basic** → App ID |
| `META_APP_SECRET` | Same page → App secret → **Show** (asks for your Facebook password) |
| `META_WEBHOOK_VERIFY_TOKEN` | Not from Meta. Any random string we choose (already generated in `.env`). We enter the same value in the webhook settings in M2. |
| `WHATSAPP_DEV_PHONE_NUMBER_ID` | Our real AppsDemo number (D-034). App dashboard → **WhatsApp → API Setup** → select that number in **From** → "Phone number ID". Alternative: WhatsApp Manager → Phone numbers → the number → details. |
| `WHATSAPP_DEV_WABA_ID` | Same API Setup page → "WhatsApp Business Account ID". Alternative: Business Settings → Accounts → WhatsApp accounts → the AppsDemo account → Summary. |
| `WHATSAPP_SYSTEM_USER_TOKEN` | Business Settings → System users (steps below). Permanent token. |
| `DEV_ALLOWED_NUMBERS` | Your own WhatsApp number(s), e.g. `919812345678`. In development the bot replies only to these. |

## 1. Development number and safety switch

We develop on the real AppsDemo number, because it is needed for demos, Click-to-WhatsApp tests and the app review screencast anyway. To protect its quality rating:

- **The bot replies only to `DEV_ALLOWED_NUMBERS` in development.** Messages from anyone else are stored but not answered.
- In WhatsApp Manager the number's status should be **Connected**. If it shows Pending or Offline, it must be registered through the API (`/{phone-number-id}/register` with a 6-digit PIN). We'll do that in M2.
- An old webhook from earlier testing will be replaced in M2. We also check `/{waba-id}/subscribed_apps`, so that no other app is receiving this number's webhooks.

The Meta test number (+1 555…) is still available for risky experiments. It can only message up to 5 verified recipients, which you add under API Setup → To → Manage phone number list.

## 2. Create a permanent System User token

The temporary token on the API Setup page expires in about 24 hours. Use a system user instead.

1. Go to business.facebook.com → **Settings** (AppsDemo portfolio) → Users → **System users** → **Add**.
   - Name: `qualify-dev`, role: **Admin**.
2. Select the system user → **Assign assets**:
   - **Apps** → AppsDemo Qualify → full control (Manage app).
   - **WhatsApp accounts** → the AppsDemo WABA (holds +91 93509 83656) → full control. Add the test-number WABA too if you want to use it.
3. Click **Generate new token**:
   - App: **AppsDemo Qualify**
   - Expiration: **Never**
   - Permissions: `whatsapp_business_messaging`, `whatsapp_business_management` (and `business_management` if listed)
4. Copy the token immediately (it is shown only once) into `WHATSAPP_SYSTEM_USER_TOKEN` in `.env`.

If the app is not listed when you generate the token, the app is not owned by the AppsDemo portfolio. Fix it in App settings → Basic → **Business portfolio**, or under Business Settings → Accounts → Apps.

## 3. Webhooks (done together in M2)

Meta must reach `/api/webhooks/meta` over public HTTPS. In local development we use a Cloudflare quick tunnel pointed at the Vite dev server (port 5173, which proxies /api) (`cloudflared`, free, no account needed for quick tunnels). Then:

- App dashboard → WhatsApp → **Configuration** → Webhook
  - Callback URL: `https://<tunnel>/api/webhooks/meta`
  - Verify token: the value of `META_WEBHOOK_VERIFY_TOKEN`
- Subscribe to the **messages** field.

## Production (later)

Each client connects their own number through Embedded Signup (Tech Provider flow). Their tokens are stored encrypted per tenant, not in `.env`. The system-user token above is only for our own development and testing.
