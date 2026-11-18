import { expect, type Page, test } from '@playwright/test';

async function signUpWithWorkspace(page: Page, unique: string): Promise<void> {
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Agent');
  await page.getByLabel('Work email').fill(`e2e-agent-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Agent Realty ${unique}`);
  // The business type picks the agent's starting template.
  await page.getByLabel('What does your business do?').click();
  await page.getByRole('option', { name: 'Real estate' }).click();
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);
}

// M4: configure the agent from the dashboard (questions with options and plain questions),
// add a lead like a lead form would, and manage API keys.
test('agent configuration, test lead and API keys from the dashboard', async ({ page }) => {
  const unique = Date.now().toString(36);
  await signUpWithWorkspace(page, unique);

  // The new workspace starts with the real estate template (v1).
  await page.getByRole('link', { name: 'AI agent' }).click();
  await expect(page.getByRole('heading', { name: 'AI agent' })).toBeVisible();
  await expect(page.getByText('Live · v1')).toBeVisible();
  await expect(page.getByText('Property type').first()).toBeVisible();
  // Other templates are one click away.
  await page.getByRole('button', { name: 'Use a template' }).click();
  await expect(page.getByText('Any business', { exact: true })).toBeVisible();
  await expect(page.getByText('Clinic and healthcare', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');

  // Add a question with options.
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByRole('menuitem', { name: /Question with options/ }).click();
  await page.getByLabel('What you collect').last().fill('Meal preference');
  await page.getByLabel('How the agent asks').last().fill('Any meal preference?');

  // Publishing without options is blocked with a clear message.
  await page.getByRole('button', { name: 'Publish v2' }).click();
  await expect(page.getByText('Add at least 2').first()).toBeVisible();

  const optionInput = page.getByPlaceholder('Type an option and press Enter');
  for (const option of ['Veg', 'Non-veg', 'Jain']) {
    await optionInput.fill(option);
    await optionInput.press('Enter');
  }
  // Three short options are shown as reply buttons in the preview.
  await expect(page.getByText('Up to 3 short options are shown as reply buttons.')).toBeVisible();

  // Add a plain question.
  await page.getByRole('button', { name: 'Add question' }).click();
  await page.getByRole('menuitem', { name: /Plain question/ }).click();
  await page.getByLabel('What you collect').last().fill('Special requests');
  await expect(page.getByText('The lead types the answer.').last()).toBeVisible();

  await page.getByRole('button', { name: 'Publish v2' }).click();
  await expect(page.getByText('Published version 2')).toBeVisible();
  await expect(page.getByText('Live · v2')).toBeVisible();

  // The questions survive a reload.
  await page.reload();
  await expect(page.getByText('Meal preference', { exact: true })).toBeVisible();
  await expect(page.getByText('Special requests', { exact: true })).toBeVisible();

  // Opening tab: preview and template state (no WhatsApp number in this workspace).
  await page.getByRole('tab', { name: 'Opening' }).click();
  await expect(page.getByText('For a lead named Rahul Sharma.')).toBeVisible();
  await expect(page.getByText('Not connected')).toBeVisible();

  // Follow-ups are configurable: change the first reminder and publish.
  await page.getByRole('tab', { name: 'Follow-ups' }).click();
  await expect(page.getByText('Follow-up template')).toBeVisible();
  await page.getByLabel('Hours before follow-up 1').fill('2');
  await page.getByRole('button', { name: 'Publish v3' }).click();
  await expect(page.getByText('Published version 3')).toBeVisible();
  await page.reload();
  await page.getByRole('tab', { name: 'Follow-ups' }).click();
  await expect(page.getByLabel('Hours before follow-up 1')).toHaveValue('2');

  // Scoring is configurable too: lower the Hot threshold.
  await page.getByRole('tab', { name: 'Scoring' }).click();
  await expect(page.getByText('Points per answer')).toBeVisible();
  await expect(page.getByText('Highest possible: 70 from answers + 30 from AI')).toBeVisible();
  await page.getByLabel('Hot from').fill('75');
  await page.getByRole('button', { name: 'Publish v4' }).click();
  await expect(page.getByText('Published version 4')).toBeVisible();

  // Version history: every publish is kept; an older one loads into the editor as a draft.
  await page.getByRole('button', { name: 'Versions' }).click();
  const history = page.getByRole('dialog');
  await expect(history.getByText('Version 4')).toBeVisible();
  await expect(history.getByText('Version 1')).toBeVisible();
  await history
    .getByRole('listitem')
    .filter({ hasText: 'Version 1' })
    .getByRole('button', { name: 'Load into editor' })
    .click();
  await expect(page.getByText('Loaded version 1')).toBeVisible();
  await expect(page.getByText('You have unpublished changes.')).toBeVisible();
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByText('You have unpublished changes.')).toHaveCount(0);

  // Add a lead like a lead form would; it opens in Conversations.
  await page.getByRole('link', { name: 'Conversations' }).click();
  await page.getByRole('button', { name: 'Add lead' }).click();
  await page.getByLabel('WhatsApp number').fill('+91 99999 0' + String(Date.now()).slice(-4));
  await page.getByLabel('Name', { exact: true }).fill('Form Lead');
  await page.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(page.getByText('Lead added')).toBeVisible();
  await expect(page).toHaveURL(/\/conversations\?lead=/);
  await expect(page.getByText('Form Lead').first()).toBeVisible();

  // The dashboard shows the real lead (no sample data).
  await page.getByRole('link', { name: 'Dashboard' }).click();
  await expect(page.getByRole('link', { name: 'Form Lead' })).toBeVisible();
  await expect(page.getByText('Sample data')).toHaveCount(0);
  // The new lead is scored from its (empty) form answers: Cold until it replies.
  await expect(page.getByText('Cold').first()).toBeVisible();

  // Costs: AI estimate and Meta status for this workspace (no WhatsApp number here).
  await page.getByRole('link', { name: 'Costs' }).click();
  await expect(page.getByRole('heading', { name: 'Costs' })).toBeVisible();
  await expect(page.getByText('No WhatsApp number connected')).toBeVisible();
  await expect(page.getByText('No AI replies in this period.')).toBeVisible();

  // API docs list this workspace's question keys, including the new one.
  await page.getByRole('link', { name: 'API docs' }).click();
  await expect(page.getByRole('heading', { name: 'API docs' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'meal_preference' })).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Veg · Non-veg · Jain' })).toBeVisible();

  // API keys: shown once, then revocable.
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'New key' }).click();
  await page.getByLabel('Name').fill('E2E key');
  await page.getByRole('button', { name: 'Create key' }).click();
  await expect(page.getByRole('textbox', { name: 'API key', exact: true })).toHaveValue(
    /^qk_live_/,
  );
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('cell', { name: 'E2E key' })).toBeVisible();
  await page.getByRole('button', { name: 'Revoke' }).click();
  await page.getByRole('button', { name: 'Revoke key' }).click();
  await expect(page.getByText('Revoked', { exact: true })).toBeVisible();
});
