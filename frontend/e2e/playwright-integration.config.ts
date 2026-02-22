import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for integration E2E tests that run against
 * the real Docker Compose stack (not mocked APIs).
 */
export default defineConfig({
  testDir: './integration',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3001',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'integration',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — we expect Docker Compose to already be running.
});
