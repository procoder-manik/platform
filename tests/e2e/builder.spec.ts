import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Phase 2 "done when": a page built only in the admin is live, and a preset change restyles everything.
test('build a page in the admin, publish it and see it live', async ({ page }) => {
  const slug = `e2e-built-${Date.now()}`;
  await signIn(page);
  await page.goto('/admin/pages/new');
  await page.getByLabel('Title').fill('Built in the admin');
  await page.getByLabel('Address').fill(slug);
  await page.getByRole('radio', { name: 'Published' }).click();
  await page.getByRole('tab', { name: 'Sections' }).click();
  await page.getByRole('button', { name: 'Add section' }).click();
  await page.getByRole('dialog', { name: 'Add a section' }).getByRole('button', { name: /^Hero/ }).click();
  await page.getByLabel('Heading', { exact: true }).fill('Hello from the builder');
  await expect(page.frameLocator('iframe[title="Page preview"]').getByRole('heading', { name: 'Hello from the builder' })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByText('Page created.')).toBeVisible();
  await page.goto(`/${slug}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Hello from the builder' })).toBeVisible();
});

test('applying a preset restyles the site', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/settings/brand');
  page.once('dialog', (d) => void d.accept());
  await page.getByRole('listitem').filter({ hasText: 'Bold' }).getByRole('button', { name: 'Apply' }).click();
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.goto('/');
  const radius = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--r-card').trim());
  expect(radius).toBe('0px');
});
