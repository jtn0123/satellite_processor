import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Dashboard needs goes/dashboard-stats endpoint
  await page.route('**/api/goes/dashboard-stats', async (route) => {
    await route.fulfill({
      json: {
        total_frames: 0,
        frames_by_satellite: {},
        last_fetch_time: null,
        active_schedules: 0,
        recent_jobs: [],
        storage_by_satellite: {},
        storage_by_band: {},
      },
    });
  });
});

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile shows bottom nav with Live tab', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(nav.getByText('Live')).toBeVisible();
  });

  test('mobile shows bottom nav with Browse tab', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(nav.getByText('Browse')).toBeVisible();
  });

  test('mobile shows bottom nav with Animate tab', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    await expect(nav.getByText('Animate')).toBeVisible();
  });

  test('mobile bottom nav navigates to live', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    await nav.getByText('Live').click();
    await expect(page).toHaveURL(/\/live/);
  });

  test('mobile pages do not have horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });
});
