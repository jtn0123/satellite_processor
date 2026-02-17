import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  // Dismiss WhatsNew modal
  await page.addInitScript(() => { localStorage.setItem("whatsNewLastSeen", "99.99.99"); });
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/goes\/frames\/[^/]+\/image/) || url.match(/\/api\/goes\/frames\/[^/]+\/thumbnail/)) { return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }); }
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/system/status')) {
      return route.fulfill({
        json: { cpu_percent: 15, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
      });
    }
    if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/frames/preview-range')) return route.fulfill({ json: { frames: [], total_count: 0, capture_interval_minutes: 10 } });
  if (url.includes('/api/goes/animations/from-range')) return route.fulfill({ json: { id: 'mock-1', status: 'pending' } });
  if (url.includes('/api/goes/animations/recent')) return route.fulfill({ json: { id: 'mock-2', status: 'pending' } });
  if (url.includes('/api/goes/animations/batch')) return route.fulfill({ json: { ids: [], status: 'queued' } });
  if (url.includes('/api/goes/animation-presets')) return route.fulfill({ json: [] });
    return route.continue();
  });
});

test('upload page renders drop zone', async ({ page }) => {
  await page.goto('/upload');
  // The UploadZone component should be visible
  await expect(page.locator('h1:has-text("Upload Images")')).toBeVisible();
});

test('shows Image Library section', async ({ page }) => {
  await page.goto('/upload');
  await expect(page.locator('text=Image Library')).toBeVisible();
});

test('drop zone has upload text', async ({ page }) => {
  await page.goto('/upload');
  await expect(page.locator('text=Drag & drop satellite images here').first()).toBeVisible();
});
