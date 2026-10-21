import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end and render tests. Runs against `next dev` because the demo module only exists in development.
 * Needs a migrated, seeded database (ADMIN_EMAIL and ADMIN_PASSWORD) in the environment.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: 'npm run dev', url: 'http://localhost:3000/api/health', reuseExistingServer: true, timeout: 180_000 },
});
