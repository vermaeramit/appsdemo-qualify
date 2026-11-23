import { expect, test } from '@playwright/test';

// D-101: the marketing website (apps/site, dev server on 5174 with `pnpm dev`). Production serves
// it at the domain's root; here it runs next to the dashboard.
const SITE = process.env.E2E_SITE_URL ?? 'http://localhost:5174';

test('website: hero, live demo button, sections and the signed-in switch', async ({ page }) => {
  await page.goto(SITE);
  await expect(
    page.getByRole('heading', { level: 1, name: /Every lead qualified on WhatsApp/ }),
  ).toBeVisible();

  // The live demo opens WhatsApp with a ready message (or sign-up when no number is set).
  const demo = page.getByRole('link', { name: 'Try it on WhatsApp' });
  const href = await demo.getAttribute('href');
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=|\/signup$/);

  // "How it works" scrolls to the animated flow.
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'How it works' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'From ad click to sales-ready, on autopilot' }),
  ).toBeInViewport();

  // Industry tabs switch to the ready-made agent's questions, with a link to the industry page.
  await page.getByRole('tab', { name: 'Travel' }).click();
  await expect(page.getByRole('tab', { name: 'Travel' })).toHaveAttribute('aria-selected', 'true');
  const panel = page.locator('#industry-panel');
  await expect(panel.getByText('Which destination do you have in mind?')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'More about travel' })).toHaveAttribute(
    'href',
    '/travel',
  );

  // FAQ answers open in place.
  await page.getByText('Do I need a new WhatsApp number?').click();
  await expect(
    page.getByText('keep using the WhatsApp Business app on your existing number'),
  ).toBeVisible();

  // Signed out: "Log in". After signing up in the dashboard: "Open dashboard".
  await expect(
    page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Log in' }),
  ).toBeVisible();
  const unique = Date.now().toString(36);
  await page.goto('/signup');
  await page.getByLabel('Full name').fill('E2E Site');
  await page.getByLabel('Work email').fill(`e2e-site-${unique}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('e2e-password-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page.goto(SITE);
  const open = page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: 'Open dashboard' });
  await expect(open).toBeVisible();
  expect(await open.getAttribute('href')).toMatch(/\/dashboard$/);
});

test('website on a phone: menu, no sideways scrolling', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto(SITE);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(
    0,
  );
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.locator('#mobile-menu').getByRole('link', { name: 'Features' }).click();
  await expect(
    page.getByRole('heading', { name: 'Everything you need to qualify every lead' }),
  ).toBeInViewport();
  await context.close();
});

// D-104: one page per industry, built from its ready-made agent.
test('industry page: its own demo, the agent’s questions, scoring and links', async ({ page }) => {
  await page.goto(`${SITE}/real-estate`);
  await expect(
    page.getByRole('heading', { level: 1, name: /Every property enquiry qualified on WhatsApp/ }),
  ).toBeVisible();
  // (The <title> is written by the build's pre-rendering, not by the dev server: unit-tested.)

  // The demo button says which page the visitor came from (when a number is set).
  const href = await page.getByRole('link', { name: 'Try it on WhatsApp' }).getAttribute('href');
  expect(href).toMatch(/real%20estate%20page|\/signup$/);

  // The ready-made agent's questions and the example score.
  await page.getByRole('link', { name: 'See what it asks' }).click();
  await expect(
    page.locator('#questions').getByText('Are you looking to buy, rent or invest?'),
  ).toBeInViewport();
  const scoring = page.locator('#scoring');
  await scoring.scrollIntoViewIfNeeded();
  await expect(scoring.getByText('Priya S.')).toBeVisible();
  await expect(scoring.getByText(/^Hot/).first()).toBeVisible();

  // Its own FAQ, then on to another industry and back to the home page's sections.
  await expect(
    page.getByText('Will the agent quote prices or confirm availability?'),
  ).toBeVisible();
  await page.getByRole('link', { name: /Travel.*See the page/ }).click();
  await expect(page).toHaveURL(/\/travel$/);
  await expect(
    page.getByRole('heading', { level: 1, name: /Every holiday enquiry qualified on WhatsApp/ }),
  ).toBeVisible();
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'FAQ' }).click();
  await expect(page).toHaveURL(/\/#faq$/);
});
