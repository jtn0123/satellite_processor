import { test, expect } from '@playwright/test';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/goes\/frames\/[^/]+\/(image|thumbnail)/)) return route.fulfill({ contentType: 'image/png', body: PIXEL });
    if (url.includes('/api/health/version')) return route.fulfill({ json: { version: '2.2.0', build: 'test' } });
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/stats')) return route.fulfill({ json: { total_images: 10, total_jobs: 5, active_jobs: 0, storage_used_mb: 256 } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
    if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, max_frames_per_fetch: 200 } });
    if (url.includes('/api/goes/frame-count')) return route.fulfill({ json: { estimate: 0 } });
    if (url.includes('/api/presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/products')) {
      return route.fulfill({
        json: {
          satellites: ['GOES-16', 'GOES-18'],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }, { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' }],
          bands: [{ id: 'C02', description: 'Red (0.64µm)' }, { id: 'C13', description: 'IR (10.3µm)' }],
        },
      });
    }
    if (url.includes('/api/goes/frames/stats')) return route.fulfill({ json: { total_frames: 50, total_size_bytes: 2500000, by_satellite: {}, by_band: {} } });
    if (url.includes('/api/goes/frames/preview-range')) return route.fulfill({ json: { frames: [], total_count: 0, capture_interval_minutes: 10 } });
    if (url.includes('/api/goes/frames')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 50 } });
    if (url.includes('/api/goes/collections')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/tags')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/crop-presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/animation-presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/animations')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/goes/fetch-presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/system/status')) return route.fulfill({ json: { cpu_percent: 10, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } } });
    return route.fulfill({ json: {} });
  });
});

test('GOES Data page loads', async ({ page }) => {
  await page.goto('/goes');
  // Should see the GOES Data page with tabs
  await expect(page.locator('[role="tablist"]')).toBeVisible();
});

test('navigate to Animate tab', async ({ page }) => {
  await page.goto('/goes');
  // Click the Animation Studio tab
  const animTab = page.locator('[role="tab"]').filter({ hasText: /animation|animate/i }).first();
  await animTab.click();
  // Verify the satellite selector is present
  await expect(page.locator('select').first()).toBeVisible();
});

test('navigate to Fetch tab', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  // Verify fetch tab loaded - should have a satellite selector or fetch button
  await expect(page.locator('select').first()).toBeVisible();
});

test('generate button exists on animation tab', async ({ page }) => {
  await page.goto('/goes');
  const animTab = page.locator('[role="tab"]').filter({ hasText: /animation|animate/i }).first();
  await animTab.click();
  const genBtn = page.getByRole('button', { name: /generate/i });
  await expect(genBtn).toBeVisible();
});
