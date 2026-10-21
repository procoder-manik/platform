import { expect, test, type Page } from '@playwright/test';
import { signIn } from './helpers';

async function setDemo(page: Page, on: boolean) {
  await page.goto('/admin/modules');
  const toggle = page.getByRole('switch', { name: /Demo/ });
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) {
    await toggle.click();
    await expect(page.getByRole('status')).toContainText(`is ${on ? 'on' : 'off'}`);
  }
}

// Phase 0 "done when": toggling a dummy module 404s its route.
test('switching the demo module off returns 404 for its page and API, and on restores them', async ({ page, request }) => {
  await signIn(page);

  await setDemo(page, false);
  // The proxy keeps switches in memory for up to MODULE_PROXY_TTL_MS (3 s by default).
  await expect.poll(async () => (await request.get('/demo')).status(), { timeout: 10_000 }).toBe(404);
  expect((await request.get('/api/demo')).status()).toBe(404);

  await setDemo(page, true);
  await expect.poll(async () => (await request.get('/demo')).status(), { timeout: 10_000 }).toBe(200);
  expect((await request.get('/api/demo')).status()).toBe(200);
});

test('a switched-off module calls its dependants out before switching', async ({ page }) => {
  await signIn(page);
  await page.goto('/admin/modules');
  const knowledge = page.getByRole('switch', { name: /Knowledge base/ });
  if ((await knowledge.getAttribute('aria-checked')) === 'true') {
    await knowledge.click();
    await expect(page.getByRole('group', { name: 'Confirm change' })).toContainText('Chat');
    await page.getByRole('button', { name: 'Cancel' }).click();
  }
});
