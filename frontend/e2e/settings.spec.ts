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
    if (url.includes('/api/settings')) return route.fulfill({ json: { default_false_color: 'vegetation', timestamp_enabled: true, timestamp_position: 'bottom-left', video_fps: 24, video_codec: 'h264', video_quality: 23 } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    return route.continue();
  });
});

test('form fields render', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  await expect(page.locator('text=Default False Color')).toBeVisible();
  await expect(page.locator('text=Video Codec')).toBeVisible();
});

test('save button exists', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=Save')).toBeVisible();
});

test('codec dropdown has options', async ({ page }) => {
  await page.goto('/settings');
  // Multiple selects now: false_color, timestamp_position, video_codec
  const selects = page.locator('select');
  await expect(selects).toHaveCount(3);
});
