import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Dismiss WhatsNew modal
  await page.addInitScript(() => { localStorage.setItem("whatsNewLastSeen", "99.99.99"); });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/goes\/frames\/[^/]+\/image/) || url.match(/\/api\/goes\/frames\/[^/]+\/thumbnail/)) { return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }); }
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
    if (url.includes('/api/system/status')) {
      return route.fulfill({
        json: { cpu_percent: 15, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
      });
    }
    if (url.includes('/api/settings')) return route.fulfill({ json: { default_false_color: 'vegetation', timestamp_enabled: true, timestamp_position: 'bottom-left', video_fps: 24, video_codec: 'h264', video_quality: 23 } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/stats')) return route.fulfill({ json: { total_size: 0, total_frames: 0, by_satellite: {}, by_band: {}, by_age: {} } });
    if (url.includes('/api/goes/dashboard-stats')) return route.fulfill({ json: { total_frames: 0, frames_by_satellite: {}, last_fetch_time: null, active_schedules: 0, storage_by_satellite: {}, storage_by_band: {}, recent_jobs: [] } });
    return route.fulfill({ json: {} });
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
