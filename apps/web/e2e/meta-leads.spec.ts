import { expect, test } from '@playwright/test';

// M4: every Meta lead form submission on one page, with date filters in the URL.
test('Meta leads page: empty state, period presets and custom dates', async ({ page }) => {
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Meta');
  await page.getByLabel('Work email').fill(`e2e-meta-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Meta ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'Meta leads' }).click();
  await expect(page.getByRole('heading', { name: 'Meta leads' })).toBeVisible();
  await expect(page.getByText('No Meta leads in this period')).toBeVisible();
  // The default is the last 30 days.
  await expect(page.getByRole('button', { name: '30 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Presets and custom dates go into the URL, so a view can be shared.
  await page.getByRole('button', { name: '7 days' }).click();
  await expect(page).toHaveURL(/from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}/);
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await page.getByLabel('From date').fill('2026-01-01');
  await expect(page).toHaveURL(/from=2026-01-01/);
  await expect(page.getByLabel('From date')).toHaveValue('2026-01-01');
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.getByText('No Meta leads in this period')).toBeVisible();

  // Opening a shared link restores the filters.
  await page.goto('/meta-leads?from=2026-02-01&to=2026-02-28');
  await expect(page.getByLabel('From date')).toHaveValue('2026-02-01');
  await expect(page.getByLabel('To date')).toHaveValue('2026-02-28');
});
