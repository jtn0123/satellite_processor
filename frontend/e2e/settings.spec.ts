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
    if (url.includes('/api/settings')) return route.fulfill({ json: { output_dir: '/data/output', default_codec: 'h264', video_fps: 24 } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    return route.continue();
  });
});

test('form fields render', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=Settings')).toBeVisible();
  await expect(page.locator('text=Default Output Directory')).toBeVisible();
  await expect(page.locator('text=Default Video Codec')).toBeVisible();
});

test('save button exists', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=Save')).toBeVisible();
});

test('codec dropdown has options', async ({ page }) => {
  await page.goto('/settings');
  const select = page.locator('select');
  await expect(select).toHaveCount(1);
  const options = select.locator('option');
  await expect(options).toHaveCount(3); // h264, hevc, av1
});
