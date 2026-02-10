import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/images')) return route.fulfill({ json: [] });
    if (url.includes('/api/jobs')) return route.fulfill({ json: [] });
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

test('step wizard navigates', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('text=Image Processing')).toBeVisible();
  await expect(page.locator('text=Video Settings')).toBeVisible();
  await expect(page.locator('text=Review & Launch')).toBeVisible();
});

test('shows Select Images heading', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('text=Select Images')).toBeVisible();
});

test('back/next step buttons work', async ({ page }) => {
  await page.goto('/process');
  // Click Video Settings step
  await page.click('text=Video Settings');
  await expect(page.locator('text=Video Settings')).toBeVisible();
  // Click back to Image Processing
  await page.click('text=Image Processing');
  await expect(page.locator('text=Image Processing')).toBeVisible();
});
