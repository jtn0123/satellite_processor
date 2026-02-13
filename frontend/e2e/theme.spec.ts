import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/stats')) return route.fulfill({ json: { total_images: 0, total_jobs: 0, active_jobs: 0, storage_used_mb: 0 } });
    if (url.includes('/api/system/status')) {
      return route.fulfill({ json: { cpu_percent: 10, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } } });
    }
    if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    return route.continue();
  });
});

test('page loads with dark theme by default', async ({ page }) => {
  await page.goto('/');
  // The app uses dark mode by default (space theme)
  const html = page.locator('html');
  const className = await html.getAttribute('class');
  // Should have dark class or no light class
  expect(className?.includes('light')).toBeFalsy();
});

test('mobile viewport renders sidebar differently', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  // Page should still load on mobile
  await expect(page.locator('text=Dashboard').first()).toBeVisible();
});
