import { createHmac } from 'node:crypto';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';

// M7: a webhook receives signed lead events (the dev worker may post to a local receiver).
test('webhooks: add, signed test event, lead.created on a new lead, delivery log', async ({
  page,
}) => {
  const received: { headers: IncomingHttpHeaders; body: string }[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const hookUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hook`;

  try {
    const unique = Date.now().toString(36);
    await page.goto('/signup');
    await page.getByLabel('Full name').fill('E2E Hooks');
    await page.getByLabel('Work email').fill(`e2e-hooks-${unique}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/onboarding/);
    await page.getByLabel('Workspace name').fill(`E2E Hooks ${unique}`);
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.getByRole('link', { name: 'Integrations' }).click();
    await expect(page.getByText('No webhooks yet')).toBeVisible();
    await page.getByRole('button', { name: 'Add webhook' }).first().click();
    await page.getByLabel('Endpoint URL').fill(hookUrl);
    await page.getByLabel('Name (optional)').fill('Test CRM');
    await page.getByRole('button', { name: 'New lead' }).click(); // also send lead.created
    await page.getByRole('dialog').getByRole('button', { name: 'Add webhook' }).click();

    // The secret is shown once.
    const secret = (await page.getByTestId('webhook-secret').textContent())!;
    expect(secret).toMatch(/^whsec_/);
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page.getByText('Test CRM')).toBeVisible();

    const verify = (index: number) => {
      const request = received[index]!;
      const header = request.headers['x-qualify-signature'] as string;
      const parts = Object.fromEntries(header.split(',').map((part) => part.split('=')));
      const expected = createHmac('sha256', secret)
        .update(`${parts.t}.${request.body}`)
        .digest('hex');
      expect(parts.v1).toBe(expected);
      return JSON.parse(request.body) as { type: string; lead: { name: string | null } };
    };

    await page.getByRole('button', { name: 'Send test event' }).click();
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
    expect(verify(0).type).toBe('webhook.test');
    await expect(page.getByText('Test event', { exact: true })).toBeVisible();
    await expect(page.getByText(/HTTP 200/)).toBeVisible();

    // A new lead fires lead.created.
    await page.goto('/leads');
    await page.getByRole('button', { name: 'Add lead' }).click();
    await page.getByLabel('WhatsApp number').fill(`+91 99996 ${String(Date.now()).slice(-5)}`);
    await page.getByLabel('Name', { exact: true }).fill('Hook Lead');
    await page.getByRole('button', { name: 'Add lead and send opening' }).click();
    await expect(page.getByText('Lead added')).toBeVisible();
    await expect.poll(() => received.length, { timeout: 15_000 }).toBe(2);
    const created = verify(1);
    expect(created.type).toBe('lead.created');
    expect(created.lead.name).toBe('Hook Lead');
  } finally {
    server.close();
  }
});
