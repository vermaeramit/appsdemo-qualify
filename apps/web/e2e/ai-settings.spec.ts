import { expect, test } from '@playwright/test';

// D-094: a new workspace starts with the AI off; Settings → AI asks for the workspace's own OpenAI
// key (or AppsDemo's, switched on from the admin page), and the test chat says why it can't run.
test('AI settings: a new workspace starts with the AI off and asks for a key', async ({ page }) => {
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E AI');
  await page.getByLabel('Work email').fill(`e2e-ai-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E AI ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByText('AI off', { exact: true })).toBeVisible();
  await expect(page.getByText('The AI is off, so leads get no replies.')).toBeVisible();

  // The key is checked before it is sent; the models come with their prices.
  const save = page.getByRole('button', { name: 'Save key and turn the AI on' });
  await expect(save).toBeDisabled();
  await page.getByLabel('OpenAI API key').fill('not-a-key');
  await expect(page.getByText('An OpenAI key starts with "sk-".')).toBeVisible();
  await expect(save).toBeDisabled();
  await page.getByRole('combobox', { name: 'Model' }).click();
  await expect(
    page.getByRole('option', { name: /GPT-5\.4 mini · \$0\.75 in \/ \$4\.50 out/ }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

  // The test chat explains why it can't run.
  await page.getByRole('link', { name: 'AI agents' }).click();
  await page.locator('a[href*="/agent?agent="]').first().click();
  await page.getByRole('button', { name: 'Test chat' }).click();
  await page.getByLabel('Message as the lead').fill('Hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/the AI is off for this workspace/)).toBeVisible();
});
