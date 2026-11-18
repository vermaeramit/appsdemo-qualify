import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// Leads list: filters in the URL, server-side paging, Excel export. The workspace has no
// WhatsApp number, so adding leads sends nothing.
test('leads list: search, grade and status filters, sort, Excel export', async ({ page }) => {
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Leads');
  await page.getByLabel('Work email').fill(`e2e-leads-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Leads ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'Leads', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Leads' })).toBeVisible();
  await expect(page.getByText('No leads match these filters')).toBeVisible();

  for (const name of ['Asha Verma', 'Ravi Gupta']) {
    await page.getByRole('button', { name: 'Add lead' }).click();
    await page.getByLabel('WhatsApp number').fill(`+91 99998 ${String(Date.now()).slice(-5)}`);
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByRole('button', { name: 'Add lead and send opening' }).click();
    await expect(page.getByText('Lead added')).toBeVisible();
    await page.goto('/leads');
  }

  await expect(page.getByText('1–2 of 2 leads')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Asha Verma/ })).toBeVisible();

  // Search goes into the URL and filters on the server.
  await page.getByLabel('Search leads').fill('ravi');
  await expect(page).toHaveURL(/q=ravi/);
  await expect(page.getByText('1–1 of 1 leads')).toBeVisible();
  await expect(page.getByRole('cell', { name: /Ravi Gupta/ })).toBeVisible();
  await page.getByLabel('Search leads').fill('');
  await expect(page.getByText('1–2 of 2 leads')).toBeVisible();

  // New leads are scored from their (empty) answers: Cold.
  await page.getByRole('button', { name: 'Hot', exact: true }).click();
  await expect(page.getByText('No leads match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Hot', exact: true }).click();
  await page.getByRole('button', { name: 'Cold', exact: true }).click();
  await expect(page.getByText('1–2 of 2 leads')).toBeVisible();

  // Status filter (multi-select).
  await page.getByRole('button', { name: 'Status' }).click();
  await page.getByRole('menuitemcheckbox', { name: 'Qualified' }).click();
  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/status=qualified/);
  await expect(page.getByText('No leads match these filters')).toBeVisible();
  await page.goto('/leads?limit=1&sort=newest');

  // Paging (one per page).
  await expect(page.getByText('1–1 of 2 leads')).toBeVisible();
  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByText('2–2 of 2 leads')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next' })).toBeDisabled();

  // Excel export of the same filters.
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export Excel' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    /^leads-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.xlsx$/,
  );
  const file = readFileSync(await download.path());
  expect(file.subarray(0, 2).toString()).toBe('PK'); // a zip (xlsx) container
});
