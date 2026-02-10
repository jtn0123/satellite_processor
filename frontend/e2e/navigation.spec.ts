import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Mock API responses
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/health')) {
      return route.fulfill({ json: { status: 'ok' } });
    }
    if (url.includes('/api/images')) {
      return route.fulfill({ json: [] });
    }
    if (url.includes('/api/jobs')) {
      return route.fulfill({ json: [] });
    }
    if (url.includes('/api/system/status')) {
      return route.fulfill({
        json: {
          cpu_percent: 15,
          memory: { total: 16e9, available: 12e9, percent: 25 },
          disk: { total: 500e9, free: 400e9, percent: 20 },
        },
      });
    }
    if (url.includes('/api/settings')) {
      return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
    }
    if (url.includes('/api/presets')) {
      return route.fulfill({ json: [] });
    }
    return route.continue();
  });
});

test('navigates to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=SatTracker')).toBeVisible();
});

test('navigates to upload page', async ({ page }) => {
  await page.goto('/upload');
  await expect(page).toHaveURL(/upload/);
});

test('navigates to jobs page', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page).toHaveURL(/jobs/);
});

test('navigates to settings page', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/settings/);
});

test('shows 404 for unknown routes', async ({ page }) => {
  await page.goto('/unknown-page');
  await expect(page.locator('text=404')).toBeVisible();
});

test('sidebar links work', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Upload');
  await expect(page).toHaveURL(/upload/);
  await page.click('text=Jobs');
  await expect(page).toHaveURL(/jobs/);
  await page.click('text=Dashboard');
  await expect(page).toHaveURL('/');
});
