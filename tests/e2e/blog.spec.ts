import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Phase 3: write a post with the rich text editor, publish it and read it with its contents list.
test('write and publish a post', async ({ page }) => {
  const title = `E2E post ${Date.now()}`;
  await signIn(page);
  await page.goto('/admin/posts/new');
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('radio', { name: 'Published' }).click();
  const editor = page.getByRole('textbox', { name: /Article/ }).or(page.locator('.ProseMirror'));
  await editor.first().click();
  await page.getByRole('button', { name: 'Import Markdown' }).click();
  await page.getByLabel(/Paste Markdown/).fill('## First part\n\nHello.\n\n## Second part\n\nWorld.');
  await page.getByRole('button', { name: 'Replace text' }).click();
  await page.getByRole('button', { name: 'Create post' }).click();
  await expect(page.getByText('Post created.')).toBeVisible();
  await page.getByRole('link', { name: 'View live' }).click();
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Contents' }).first()).toContainText('Second part');
});

test('the portfolio screenshot scrolls on hover', async ({ page }) => {
  await page.goto('/portfolio');
  const shot = page.locator('img[alt^="Screenshot of"]').first();
  if ((await shot.count()) === 0) test.skip(true, 'No published projects with screenshots.');
  await shot.hover();
  await expect.poll(async () => shot.evaluate((el) => getComputedStyle(el).transform)).not.toBe('none');
});
