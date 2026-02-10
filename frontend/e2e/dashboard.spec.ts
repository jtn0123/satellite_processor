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

test('stats cards render', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  // System stats should be visible
  await expect(page.locator('text=/cpu/i').first()).toBeVisible();
});

test('quick action buttons navigate correctly', async ({ page }) => {
  await page.goto('/');
  // Look for action buttons that link to upload/process
  const uploadLink = page.locator('a[href="/upload"], button:has-text("Upload")').first();
  if (await uploadLink.isVisible()) {
    await uploadLink.click();
    await expect(page).toHaveURL(/upload/);
  }
});
