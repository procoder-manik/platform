import { expect, test } from '@playwright/test';
import { RESOURCES } from '../../src/lib/admin/registry';
import { SETTINGS_GROUPS } from '../../src/lib/settings/registry';
import { failOnErrors, signIn } from './helpers';

// Quality gate 4: every screen renders in a real browser without console errors.
const adminScreens = [
  { path: '/admin', heading: 'Dashboard' },
  { path: '/admin/modules', heading: 'Modules' },
  { path: '/admin/media', heading: 'Media' },
  ...SETTINGS_GROUPS.filter((g) => !g.customScreen).map((g) => ({ path: `/admin/settings/${g.key}`, heading: g.label })),
  ...RESOURCES.map((r) => ({ path: `/admin/${r.id}`, heading: r.labelPlural })),
  ...RESOURCES.filter((r) => r.creatable !== false && !r.readOnly).map((r) => ({ path: `/admin/${r.id}/new`, heading: `New ${r.label.toLowerCase()}` })),
];

test('public screens render without errors', async ({ page }) => {
  const check = failOnErrors(page);
  for (const path of ['/', '/demo']) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
  check();
});

test('the 404 page renders with a 404 status', async ({ page }) => {
  const response = await page.goto('/this-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page is not here' })).toBeVisible();
});

test('every admin screen renders without errors', async ({ page }) => {
  await signIn(page);
  const check = failOnErrors(page);
  for (const screen of adminScreens) {
    await page.goto(screen.path);
    await expect(page.getByRole('heading', { level: 1, name: screen.heading }), screen.path).toBeVisible();
  }
  check();
});

test('admin redirects to sign-in when signed out', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
});
