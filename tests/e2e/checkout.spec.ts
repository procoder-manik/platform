import { expect, test } from '@playwright/test';

// Phase 5: a buyer picks a package, orders with a manual method and lands on a private order page.
// Needs at least one active buy-now package and a manual payment method with its details set.
test('order a package with a manual payment method', async ({ page }) => {
  await page.goto('/pricing');
  const buy = page.getByRole('link', { name: 'Buy now' }).first();
  test.skip((await buy.count()) === 0, 'No buy-now package is listed.');
  await buy.click();
  await expect(page.getByRole('heading', { level: 1, name: 'Checkout' })).toBeVisible();
  await page.getByLabel('Name', { exact: true }).fill('E2E Buyer');
  await page.getByLabel('Email', { exact: true }).fill(`e2e.${Date.now()}@example.test`);
  const manual = page.getByRole('radio', { name: /bKash|Bank transfer|Nagad|Rocket|Wise|Payoneer/ }).first();
  test.skip((await manual.count()) === 0, 'No manual payment method is switched on.');
  await manual.check();
  for (const box of await page.getByRole('checkbox').all()) await box.check();
  await page.getByRole('button', { name: /Place order/ }).click();
  await expect(page).toHaveURL(/\/order\/[\w-]{20,}/);
  await expect(page.getByRole('heading', { level: 1, name: /Order / })).toBeVisible();
  await expect(page.getByText('Waiting for payment')).toBeVisible();
});

test('the quote button opens the contact form with the package filled in', async ({ page }) => {
  await page.goto('/pricing');
  const quote = page.getByRole('link', { name: 'Request a quote' }).first();
  test.skip((await quote.count()) === 0, 'No quote package is listed.');
  await quote.click();
  await expect(page.getByLabel('Message')).toHaveValue(/I would like a quote for/);
});
