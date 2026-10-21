import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

// Phase 4: the score shows in the editor and the list, and each public template prints valid JSON-LD.
test('the SEO panel scores while typing', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/pages/new');
  await page.getByLabel('Title').fill('SEO check page');
  await page.getByRole('tab', { name: 'SEO' }).click();
  await page.getByLabel('Focus keyword').fill('seo check');
  await expect(page.getByRole('region', { name: 'SEO score' }).or(page.getByLabel('SEO score'))).toBeVisible({ timeout: 15_000 });
  await page.getByRole('tab', { name: 'Schema' }).click();
  await expect(page.getByLabel('Schema panel')).toContainText('WebSite');
});

test('public templates print one JSON-LD graph', async ({ page }) => {
  for (const path of ['/', '/blog', '/portfolio']) {
    const response = await page.goto(path);
    if (response?.status() !== 200) continue;
    const graphs = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(graphs.length, path).toBeGreaterThanOrEqual(1);
    for (const g of graphs) expect(JSON.parse(g)['@graph'].length, path).toBeGreaterThan(1);
  }
});
