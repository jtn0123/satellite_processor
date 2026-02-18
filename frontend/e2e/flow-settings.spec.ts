import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Settings page needs a more complete settings response to avoid crash
  await page.route('**/api/settings', async (route) => {
    await route.fulfill({
      json: {
        video_fps: 24,
        max_frames_per_fetch: 200,
        default_codec: 'libx264',
        output_format: 'mp4',
        storage_used_bytes: 256000000,
        storage_limit_bytes: 1000000000,
      },
    });
  });
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

test.describe('Settings page flow', () => {
  test('settings page loads without crash', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).not.toBeEmpty();
  });

  test('settings is accessible via sidebar navigation', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    await sidebar.getByText('Settings').click();
    await expect(page).toHaveURL(/settings/);
  });

  test('navigating to settings does not blank the page', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForTimeout(2000);
    const bodyText = await page.textContent('body');
    expect(bodyText?.length).toBeGreaterThan(10);
  });
});
