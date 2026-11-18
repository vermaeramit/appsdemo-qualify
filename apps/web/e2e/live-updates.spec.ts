import { expect, test } from '@playwright/test';

// D-079: a change made elsewhere appears without waiting for polling (20 s): the api pushes a
// Server-Sent Event and the open page refetches. The workspace has no number (nothing is sent).
test('live updates: a lead added in another tab shows up at once', async ({ page, context }) => {
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Live');
  await page.getByLabel('Work email').fill(`e2e-live-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Live ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);

  // Wait for the live stream to be open before changing anything.
  const streaming = page.waitForResponse((response) => response.url().endsWith('/api/live'));
  await page.goto('/conversations');
  await expect(page.getByText('No conversations yet')).toBeVisible();
  expect((await streaming).status()).toBe(200);

  const other = await context.newPage();
  await other.goto('/leads');
  await other.getByRole('button', { name: 'Add lead' }).click();
  await other.getByLabel('WhatsApp number').fill(`+91 99995 ${String(Date.now()).slice(-5)}`);
  await other.getByLabel('Name', { exact: true }).fill('Live Lead');
  await other.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(other.getByText('Lead added')).toBeVisible();

  await expect(page.getByText('Live Lead', { exact: true })).toBeVisible({ timeout: 6_000 });
});
