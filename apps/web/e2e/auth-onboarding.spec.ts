import { expect, test } from '@playwright/test';

// M1 acceptance: sign up → create workspace → dashboard → sign out → sign in again.
test('a new user can sign up, create a workspace and sign back in', async ({ page }) => {
  const unique = Date.now().toString(36);
  const email = `e2e-${unique}@example.com`;
  const password = 'e2e-password-123';
  const workspace = `E2E Travels ${unique}`;

  // Signed-out visitors are sent to the login page.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);

  // Client-side validation shows friendly errors.
  await page.getByRole('link', { name: 'Create an account' }).click();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Enter your name')).toBeVisible();

  // Sign up.
  await page.getByLabel('Full name').fill('E2E Tester');
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();

  // Onboarding: create the first workspace.
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(workspace);
  await page.getByRole('button', { name: 'Create workspace' }).click();

  // Dashboard shows the user and the workspace.
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /, E2E$/ })).toBeVisible();
  await expect(page.getByText(workspace).first()).toBeVisible();
  await expect(page.getByText('API online')).toBeVisible();

  // Settings: the number health card says what to do when nothing is connected.
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('WhatsApp number', { exact: true })).toBeVisible();
  await expect(page.getByText('No WhatsApp number is connected yet.')).toBeVisible();
  // Without META_ES_CONFIG_ID the owner is told how the number gets connected.
  await expect(page.getByText(/Connecting from here needs Meta/)).toBeVisible();

  // Templates live on the WhatsApp account: without a number the page says so.
  await page.getByRole('link', { name: 'Templates' }).click();
  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Settings' })).toBeVisible();

  // The platform admin page is for PLATFORM_ADMIN_EMAILS only.
  await expect(page.getByRole('link', { name: 'Platform admin' })).toHaveCount(0);
  await page.goto('/admin');
  await expect(page.getByText('Only platform admins can see this page')).toBeVisible();
  await page.getByRole('link', { name: 'Dashboard' }).click();

  // Command palette opens with Ctrl+K.
  await page.keyboard.press('Control+k');
  await expect(page.getByPlaceholder('Type a command or search…')).toBeVisible();
  await page.keyboard.press('Escape');

  // Sign out through the account menu.
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);

  // Wrong password is rejected with a clear message.
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: /invalid email or password/i }),
  ).toBeVisible();

  // Correct password signs back in, straight to the dashboard.
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(workspace).first()).toBeVisible();
});
