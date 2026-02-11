import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/system/status')) {
      return route.fulfill({
        json: { cpu_percent: 15, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
      });
    }
    if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    return route.continue();
  });
});

test('process page loads', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('h1:has-text("Process Images")')).toBeVisible();
});

test('shows Select Images heading', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('text=Select Images').first()).toBeVisible();
});

test('shows empty gallery when no images', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('text=No images yet')).toBeVisible();
});
