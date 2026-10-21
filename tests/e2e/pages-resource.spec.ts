import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Phase 1 "done when": a sample resource (Pages) is fully manageable from the admin.
test('create, edit, quick edit, duplicate, trash and restore a page', async ({ page }) => {
  const title = `E2E page ${Date.now()}`;
  await signIn(page);

  await page.goto('/admin/pages/new');
  await page.getByRole('button', { name: 'Create page' }).click();
  await expect(page.getByText('Title is required.')).toBeVisible();

  await page.getByLabel('Title').fill(title);
  await page.getByRole('radio', { name: 'Published' }).click();
  await page.getByRole('tab', { name: 'SEO' }).click();
  await page.getByLabel('Meta description').fill('A page made by the end-to-end test.');
  await page.keyboard.press('ControlOrMeta+s');
  await expect(page).toHaveURL(/\/admin\/pages\/[0-9a-f-]+/);
  await expect(page.getByText('Page created.')).toBeVisible();

  await page.getByRole('tab', { name: 'Content' }).click();
  await page.getByLabel('Title').fill(`${title} edited`);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('All changes saved')).toBeVisible();

  await page.getByRole('button', { name: /Versions/ }).click();
  await expect(page.getByRole('complementary', { name: 'Versions' }).getByRole('button', { name: 'Restore' })).toBeVisible();

  await page.goto(`/admin/pages?q=${encodeURIComponent(title)}`);
  const row = page.getByRole('row', { name: new RegExp(`${title} edited`) });
  await row.getByRole('button', { name: 'Quick edit' }).click();
  await page.getByLabel('Title').fill(`${title} quick`);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('link', { name: `${title} quick` })).toBeVisible();

  await page.getByRole('row', { name: new RegExp(`${title} quick`) }).getByRole('button', { name: 'Duplicate' }).click();
  await expect(page.getByRole('link', { name: `${title} quick (copy)` })).toBeVisible();

  await page.getByRole('checkbox', { name: `Select ${title} quick (copy)` }).check();
  await page.getByRole('region', { name: 'Bulk actions' }).getByRole('button', { name: 'Move to Trash' }).click();
  await expect(page.getByText('1 item moved to Trash.')).toBeVisible();

  await page.getByRole('link', { name: /Trash/ }).click();
  await page.getByRole('row', { name: new RegExp(`${title} quick \\(copy\\)`) }).getByRole('button', { name: 'Restore' }).click();
  await expect(page.getByText('1 item restored.')).toBeVisible();
});
