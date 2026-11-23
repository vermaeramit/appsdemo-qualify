import { expect, test } from '@playwright/test';

// D-091: the activity log per conversation and the workspace Logs page. The workspace has no
// WhatsApp number, so nothing is sent and the opening's failure shows up as a problem.
test('activity log: conversation Activity panel and the Logs page with filters', async ({
  page,
}) => {
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Logs');
  await page.getByLabel('Work email').fill(`e2e-logs-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel('Workspace name').fill(`E2E Logs ${unique}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  // A lead added from the dashboard.
  await page.getByRole('link', { name: 'Conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Add lead' }).click();
  await page.getByLabel('WhatsApp number').fill('+91 99999 1' + String(Date.now()).slice(-4));
  await page.getByLabel('Name', { exact: true }).fill('Log Lead');
  await page.getByLabel('Campaign (optional)').fill('Diwali');
  await page.getByRole('button', { name: 'Add lead and send opening' }).click();
  await expect(page.getByText('Lead added')).toBeVisible();
  await expect(page).toHaveURL(/\/conversations\?lead=/);

  // The conversation's Activity: who added it, and why no opening went out.
  await page.getByRole('button', { name: 'Activity' }).click();
  const panel = page.getByRole('dialog');
  await expect(panel.getByText('E2E Logs added this lead from the dashboard')).toBeVisible();
  const openingProblem = panel.getByText(
    'Opening not sent: no WhatsApp number is connected to this workspace',
  );
  await expect(openingProblem).toBeVisible({ timeout: 15_000 });
  // Details open on tap.
  await panel.getByText('E2E Logs added this lead from the dashboard').click();
  await expect(panel.getByText('Diwali', { exact: true })).toBeVisible();
  // Problems only hides the routine entry.
  await panel.getByText('Problems only').click();
  await expect(openingProblem).toBeVisible();
  await expect(panel.getByText('E2E Logs added this lead from the dashboard')).toHaveCount(0);
  await page.keyboard.press('Escape');

  // Pausing the AI is a team action in the log too.
  await page.getByRole('button', { name: 'Pause AI' }).click();
  await expect(page.getByRole('button', { name: 'Resume AI' })).toBeVisible();

  // The workspace Logs page: connection state on top, every lead's activity below.
  await page.getByRole('link', { name: 'Logs' }).click();
  await expect(page.getByRole('heading', { name: 'Logs' })).toBeVisible();
  await expect(page.getByText('No WhatsApp number connected')).toBeVisible();
  await expect(page.getByText('E2E Logs paused the AI: the team handles this lead')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Log Lead' }).first()).toBeVisible();
  // Filter by source (kept in the URL).
  await page.getByRole('button', { name: 'Opening and follow-ups', exact: true }).click();
  await expect(page).toHaveURL(/source=outreach/);
  await expect(
    page.getByText('Opening not sent: no WhatsApp number is connected to this workspace'),
  ).toBeVisible();
  await expect(page.getByText('E2E Logs paused the AI: the team handles this lead')).toHaveCount(0);
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await page.getByText('Problems only').click();
  await expect(page).toHaveURL(/problems=true/);
  await expect(page.getByText('E2E Logs added this lead from the dashboard')).toHaveCount(0);
  await expect(
    page.getByText('Opening not sent: no WhatsApp number is connected to this workspace'),
  ).toBeVisible();
  // The entry links to its conversation.
  await page.getByRole('link', { name: 'Log Lead' }).first().click();
  await expect(page).toHaveURL(/\/conversations\?lead=/);
});
