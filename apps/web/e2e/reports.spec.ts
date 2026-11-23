import { expect, test } from '@playwright/test';

// The dev stack sends e-mail to Mailpit (compose.yaml); its API shows what arrived.
const MAILPIT = 'http://localhost:8025/api/v1';

interface MailpitSummary {
  ID: string;
  Subject: string;
  Attachments: number;
}

// D-088: a scheduled e-mail report, sent now, arrives with the period's leads as Excel.
test('email reports: create, send now, delivered with the Excel, edit, pause, delete', async ({
  page,
  request,
}) => {
  const unique = Date.now().toString(36);
  const recipient = `e2e-report-${unique}@example.com`;
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Reports');
  await page.getByLabel('Work email').fill(`e2e-reports-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Reports ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // One lead today, so "Send now" (today so far) has something to report.
  await page.goto('/leads');
  await page.getByRole('button', { name: 'Add lead' }).click();
  await page.getByLabel('WhatsApp number').fill(`+91 99995 ${String(Date.now()).slice(-5)}`);
  await page.getByLabel('Name', { exact: true }).fill('Report Lead');
  await page.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(page.getByText('Lead added')).toBeVisible();

  await page.getByRole('link', { name: 'Integrations' }).click();
  await expect(page.getByText('No email reports yet')).toBeVisible();
  await page.getByRole('button', { name: 'New report' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Morning report');
  // Saving without a recipient is refused with a clear message.
  await dialog.getByRole('button', { name: 'Save report' }).click();
  await expect(dialog.getByText('Add at least one e-mail address')).toBeVisible();
  await dialog.getByLabel('Send to').fill('not-an-email');
  await dialog.getByLabel('Send to').press('Enter');
  await expect(dialog.getByText('“not-an-email” is not an e-mail address')).toBeVisible();
  await dialog.getByLabel('Send to').fill(recipient);
  await dialog.getByLabel('Send to').press('Enter');
  await expect(dialog.getByRole('list', { name: 'Recipients' })).toContainText(recipient);
  await dialog.getByRole('button', { name: 'Save report' }).click();
  await expect(page.getByText('“Morning report” saved')).toBeVisible();

  const card = page.locator('[data-slot="card"]', { hasText: 'Morning report' });
  await expect(card).toContainText('Daily at 09:00');
  await expect(card).toContainText(recipient);
  await expect(card).toContainText('Next:');

  // Send now: the worker e-mails it within seconds.
  await card.getByRole('button', { name: 'Send now' }).click();
  await expect(page.getByText('Sending the report')).toBeVisible();
  await expect(card.getByText('Sent · 1 lead')).toBeVisible({ timeout: 20_000 });

  const search = async () => {
    const response = await request.get(
      `${MAILPIT}/search?query=${encodeURIComponent(`to:${recipient}`)}`,
    );
    const body = (await response.json()) as { messages: MailpitSummary[] };
    return body.messages;
  };
  await expect.poll(async () => (await search()).length, { timeout: 15_000 }).toBe(1);
  const [message] = await search();
  expect(message!.Subject).toMatch(/^Morning report: 1 new lead, 0 Hot · /);
  expect(message!.Attachments).toBe(1);
  const detail = (await (await request.get(`${MAILPIT}/message/${message!.ID}`)).json()) as {
    HTML: string;
    Attachments: { FileName: string }[];
  };
  expect(detail.Attachments[0]!.FileName).toMatch(/^leads-\d{4}-\d{2}-\d{2}\.xlsx$/);
  expect(detail.HTML).toContain('Report Lead');

  // History lists the run.
  await card.getByRole('button', { name: 'History' }).click();
  await expect(card.getByRole('list', { name: 'Report history' })).toContainText('Sent by hand');

  // Edit: weekly on Monday.
  await card.getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Weekly' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(card).toContainText('Weekly on Monday at 09:00');

  // Pause, then delete.
  await card.getByRole('switch', { name: 'Report on' }).click();
  await expect(card).toContainText('Paused');
  await card.getByRole('button', { name: 'Delete' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Report deleted')).toBeVisible();
  await expect(page.getByText('No email reports yet')).toBeVisible();
});
