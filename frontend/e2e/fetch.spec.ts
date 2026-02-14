import { test, expect } from '@playwright/test';

const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', async (route) => {
    const url = route.request().url();
    if (url.match(/\/api\/goes\/frames\/[^/]+\/(image|thumbnail)/)) return route.fulfill({ contentType: 'image/png', body: PIXEL });
    if (url.includes('/api/health/version')) return route.fulfill({ json: { version: '1.8.0', build: 'test' } });
    if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
    if (url.includes('/api/stats')) return route.fulfill({ json: { total_images: 10, total_jobs: 5, active_jobs: 0, storage_used_mb: 256 } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
    if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24 } });
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
    if (url.includes('/api/goes/fetch')) {
      return route.fulfill({ json: { job_id: 'fetch-job-1', status: 'pending' } });
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

test('navigate to GOES fetch tab', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /fetch/i }).click();
  await expect(page.getByText(/GOES-16/)).toBeVisible();
});

test('satellite selector shows options', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /fetch/i }).click();

  // Should see satellite options
  await expect(page.getByText(/GOES-16/)).toBeVisible();
});

test('fetch button is present', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /fetch/i }).click();

  const fetchBtn = page.getByRole('button', { name: /fetch/i }).first();
  await expect(fetchBtn).toBeVisible();
});

test('trigger fetch creates job notification', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /fetch/i }).click();

  // Click fetch
  const fetchBtn = page.getByRole('button', { name: /fetch/i }).first();
  await fetchBtn.click();

  // Should see some success indication (toast or status text)
  await expect(page.getByText(/pending|started|queued|success|fetching/i).first()).toBeVisible({ timeout: 5000 });
});

test('GOES data page shows frame stats', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();

  // Should show frame statistics from mock
  await expect(page.getByText(/50|frames/i).first()).toBeVisible({ timeout: 5000 });
});
