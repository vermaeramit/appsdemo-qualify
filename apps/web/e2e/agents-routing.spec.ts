import { expect, test } from '@playwright/test';

// D-097: the default agent is chosen on the AI agents page, and a lead added for an agent stays
// with that agent. The workspace has no WhatsApp number, so nothing is sent.
test('agents: choose the default agent, and add a lead for a specific agent', async ({ page }) => {
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Agents');
  await page.getByLabel('Work email').fill(`e2e-agents-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Agents ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/$/);

  // A second agent.
  await page.getByRole('link', { name: 'AI agents' }).click();
  await page.getByRole('button', { name: /New agent/ }).click();
  await page.getByLabel('Name').fill('Premium desk');
  await page.getByRole('button', { name: 'Create agent' }).click();
  await expect(page).toHaveURL(/\/agent\?agent=/);

  // The default agent is picked on the overview.
  await page.getByRole('link', { name: 'AI agents' }).click();
  const picker = page.getByRole('combobox', { name: 'Default agent' });
  await expect(picker).toBeVisible();
  const firstDefault = (await picker.textContent())?.trim() ?? '';
  await picker.click();
  await page.getByRole('option', { name: 'Premium desk' }).click();
  await expect(page.getByText('Premium desk is now the default agent')).toBeVisible();
  const premiumCard = page.getByRole('link').filter({ hasText: 'Premium desk' });
  await expect(premiumCard.getByText('Default', { exact: true })).toBeVisible();

  // A lead added for the first agent stays with it, although it isn't the default any more.
  await page.getByRole('link', { name: 'Conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Add lead' }).click();
  await page.getByLabel('WhatsApp number').fill('+91 99999 3' + String(Date.now()).slice(-4));
  await page.getByLabel('Name', { exact: true }).fill('Agent Lead');
  await page.getByRole('combobox', { name: 'AI agent' }).click();
  await page.getByRole('option', { name: firstDefault, exact: true }).click();
  await page.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(page).toHaveURL(/\/conversations\?lead=/);
  await expect(page.getByText(`Handled by: ${firstDefault}`)).toBeVisible();

  // Automatic: the new default agent.
  await page.getByRole('button', { name: 'Add lead' }).click();
  await page.getByLabel('WhatsApp number').fill('+91 99999 4' + String(Date.now()).slice(-4));
  await page.getByLabel('Name', { exact: true }).fill('Auto Lead');
  await page.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(page.getByText('Handled by: Premium desk')).toBeVisible();
});
