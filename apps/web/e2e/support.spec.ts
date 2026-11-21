import { expect, type Page, test } from '@playwright/test';

// D-092: a platform admin opens a client's workspace read-only, with a reason, and the visit is
// recorded on both sides. Needs an address listed in the api's PLATFORM_ADMIN_EMAILS (the
// account is created on the first run): E2E_PLATFORM_ADMIN_EMAIL=... pnpm test:e2e
const ADMIN_EMAIL = process.env.E2E_PLATFORM_ADMIN_EMAIL;
const PASSWORD = 'e2e-password-123';

async function signUp(page: Page, name: string, email: string, workspace: string) {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(workspace);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Signs the admin in, or creates the account (with a workspace of its own) the first time. */
async function signInAdmin(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  // Wait for the outcome, however slow the stack is: signed in, or no such account yet.
  const unknown = page.getByRole('alert').filter({ hasText: /invalid email or password/i });
  await Promise.race([
    page
      .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
      .catch(() => undefined),
    unknown.waitFor({ timeout: 20_000 }).catch(() => undefined),
  ]);
  const signedIn = !new URL(page.url()).pathname.startsWith('/login');
  if (!signedIn) await signUp(page, 'E2E Support', email, 'E2E Support Desk');
}

test('support access: read-only visit to a client workspace, recorded on both sides', async ({
  browser,
  baseURL,
}) => {
  test.skip(!ADMIN_EMAIL, 'Set E2E_PLATFORM_ADMIN_EMAIL to an address in PLATFORM_ADMIN_EMAILS');
  const unique = Date.now().toString(36);
  const clientName = `E2E Client ${unique}`;

  // The client: a workspace with one lead (no WhatsApp number, so nothing is sent).
  const client = await (await browser.newContext()).newPage();
  await signUp(client, 'E2E Client Owner', `e2e-client-${unique}@example.com`, clientName);
  await client.getByRole('link', { name: 'Conversations', exact: true }).click();
  await client.getByRole('button', { name: 'Add lead' }).click();
  await client.getByLabel('WhatsApp number').fill('+91 99999 2' + String(Date.now()).slice(-4));
  await client.getByLabel('Name', { exact: true }).fill('Support Lead');
  await client.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(client).toHaveURL(/\/conversations\?lead=/);
  const leadId = new URL(client.url()).searchParams.get('lead')!;

  // The admin opens it read-only: a reason is required.
  const admin = await (await browser.newContext()).newPage();
  await signInAdmin(admin, ADMIN_EMAIL!);
  await admin.goto('/admin');
  const row = admin.getByRole('row').filter({ hasText: clientName });
  await row.getByRole('button', { name: 'Open read-only' }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Open read-only' }).click();
  await expect(dialog.getByText('Write why you need access')).toBeVisible();
  await dialog.getByLabel('Reason').fill('E2E: the client asked why a lead got no reply');
  await dialog.getByRole('button', { name: 'Open read-only' }).click();
  await expect(admin).toHaveURL(/\/$/);
  await expect(admin.getByText(`Support view of ${clientName}`)).toBeVisible();
  await expect(admin.getByText('Support view (read-only)')).toBeVisible();

  // It reads the client's conversation, without the controls that change things.
  await admin.goto(`/conversations?lead=${leadId}`);
  await expect(admin.getByText('Support Lead').first()).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Activity' })).toBeVisible();
  await expect(admin.getByRole('button', { name: 'Pause AI' })).toHaveCount(0);
  await expect(admin.getByRole('button', { name: 'Add lead' })).toHaveCount(0);
  // The API refuses every change and the bulk export.
  const pause = await admin.request.post(`/api/conversations/${leadId}/pause`, {
    headers: { origin: baseURL! },
  });
  expect(pause.status()).toBe(403);
  expect(await pause.json()).toMatchObject({ message: 'Support access is read-only' });
  expect((await admin.request.get('/api/leads/export')).status()).toBe(403);
  // The lead's Activity names the visit.
  await admin.getByRole('button', { name: 'Activity' }).click();
  await expect(
    admin
      .getByRole('dialog')
      .getByText('E2E Support from platform support opened this conversation'),
  ).toBeVisible();
  await admin.keyboard.press('Escape');

  // Exit: back to the admin page, with the visit in the history.
  await admin.getByRole('button', { name: 'Exit support view' }).click();
  await expect(admin).toHaveURL(/\/admin/);
  await expect(admin.getByText(`Support view of ${clientName}`)).toHaveCount(0);
  const visit = admin
    .getByRole('row')
    .filter({ hasText: 'E2E: the client asked why a lead got no reply' })
    .filter({ hasText: clientName });
  await expect(visit).toContainText(/Ended after \d+ min/);
  await expect(visit.getByRole('cell').last()).toHaveText('1');
  // The client's workspace is no longer readable from this browser session.
  expect((await admin.request.get(`/api/conversations/${leadId}`)).status()).toBe(404);

  // The client sees the visit, with the reason, in its Logs.
  await client.getByRole('link', { name: 'Logs' }).click();
  const opened = client.getByText(
    'E2E Support from platform support opened this workspace (read-only)',
  );
  await expect(opened).toBeVisible();
  await expect(
    client.getByText('E2E Support from platform support left this workspace'),
  ).toBeVisible();
  await opened.click();
  await expect(client.getByText('E2E: the client asked why a lead got no reply')).toBeVisible();
});

// D-094: for a client without an OpenAI account, the platform admin switches on AppsDemo's key
// with a monthly limit; the client sees it in Settings and Logs, and it can be switched off again.
test("AI access: the platform admin switches AppsDemo's key on and off for a client", async ({
  browser,
}) => {
  test.skip(!ADMIN_EMAIL, 'Set E2E_PLATFORM_ADMIN_EMAIL to an address in PLATFORM_ADMIN_EMAILS');
  const unique = Date.now().toString(36);
  const clientName = `E2E AI Client ${unique}`;
  const client = await (await browser.newContext()).newPage();
  await signUp(client, 'E2E AI Owner', `e2e-ai-client-${unique}@example.com`, clientName);
  await client.getByRole('link', { name: 'Settings' }).click();
  await expect(client.getByText('AI off', { exact: true })).toBeVisible();

  const admin = await (await browser.newContext()).newPage();
  await signInAdmin(admin, ADMIN_EMAIL!);
  await admin.goto('/admin');
  // The price list is there, with the model clients get by default.
  await expect(admin.getByText('AI models & prices')).toBeVisible();
  await expect(admin.getByRole('cell', { name: /^gpt-5\.4-mini/ })).toBeVisible();

  const row = admin.getByRole('row').filter({ hasText: clientName });
  await expect(row.getByText('AI off')).toBeVisible();
  await row.getByRole('button', { name: `Manage AI for ${clientName}` }).click();
  const dialog = admin.getByRole('dialog');
  await dialog.getByLabel('Monthly limit (USD)').fill('5');
  await dialog.getByRole('button', { name: "Use AppsDemo's key" }).click();
  await expect(row.getByText("AppsDemo's key")).toBeVisible();
  await expect(row.getByText(/\$0 \/ \$5/)).toBeVisible();

  // The client sees AppsDemo's key, the limit, and the change in its Logs.
  await client.reload();
  await expect(client.getByText("AppsDemo's key", { exact: true })).toBeVisible();
  await expect(client.getByText('$0 of $5')).toBeVisible();
  await expect(client.getByText('AppsDemo provides the AI for this workspace')).toBeVisible();
  await client.getByRole('link', { name: 'Logs' }).click();
  await expect(
    client.getByText(
      "E2E Support from platform support switched on AppsDemo's AI key for this workspace",
    ),
  ).toBeVisible();

  // Off again: no own key saved, so the AI is off.
  await row.getByRole('button', { name: `Manage AI for ${clientName}` }).click();
  await admin.getByRole('dialog').getByRole('button', { name: "Stop AppsDemo's key" }).click();
  await expect(row.getByText('AI off')).toBeVisible();
  await client.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(client.getByText('AI off', { exact: true })).toBeVisible();
});

// D-095: the platform's SMTP server is set on the admin page: checked before saving, a test
// e-mail goes through it (Mailpit in the dev stack), and removing it falls back to the .env.
test('Email settings: save an SMTP server, send a test e-mail, remove it', async ({
  browser,
  request,
}) => {
  test.skip(!ADMIN_EMAIL, 'Set E2E_PLATFORM_ADMIN_EMAIL to an address in PLATFORM_ADMIN_EMAILS');
  const admin = await (await browser.newContext()).newPage();
  await signInAdmin(admin, ADMIN_EMAIL!);
  await admin.goto('/admin');
  await expect(admin.getByText('Email (SMTP)')).toBeVisible();

  // A server that refuses the connection is not saved.
  await admin.getByLabel('SMTP server', { exact: true }).fill('localhost');
  await admin.getByRole('combobox', { name: 'Security' }).click();
  await admin.getByRole('option', { name: /None/ }).click();
  await admin.getByLabel('Port', { exact: true }).fill('1');
  await admin.getByLabel('Sender name', { exact: true }).fill('E2E Reports');
  await admin.getByLabel('Sender e-mail', { exact: true }).fill('reports@e2e.test');
  await admin.getByRole('button', { name: 'Check connection and save' }).click();
  await expect(admin.getByText(/The SMTP server refused the connection/)).toBeVisible();

  // Mailpit (the dev stack's SMTP) is accepted, saved, and carries the test e-mail.
  await admin.getByLabel('Port', { exact: true }).fill('1025');
  await admin.getByRole('button', { name: 'Check connection and save' }).click();
  await expect(
    admin.getByText('The SMTP server accepted the connection. Settings saved.'),
  ).toBeVisible();
  await expect(admin.getByText('Sending', { exact: true })).toBeVisible();
  const recipient = `smtp-test-${Date.now().toString(36)}@example.com`;
  await admin.getByLabel('Send a test e-mail to', { exact: true }).fill(recipient);
  await admin.getByRole('button', { name: 'Send test e-mail' }).click();
  await expect(admin.getByText(`Test e-mail sent to ${recipient}`)).toBeVisible();
  await expect
    .poll(async () => {
      const response = await request.get(
        `http://localhost:8025/api/v1/search?query=${encodeURIComponent(`to:${recipient}`)}`,
      );
      const body = (await response.json()) as { messages: { From: { Name: string } }[] };
      return body.messages[0]?.From.Name ?? null;
    })
    .toBe('E2E Reports');

  // Removed: back to the development default.
  await admin.getByRole('button', { name: 'Remove saved server' }).click();
  await admin.getByRole('alertdialog').getByRole('button', { name: 'Remove' }).click();
  await expect(admin.getByText('Development', { exact: true })).toBeVisible();
});
