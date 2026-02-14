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
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }],
          bands: [{ id: 'C02', description: 'Red (0.64µm)' }],
        },
      });
    }
    if (url.includes('/api/goes/crop-presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/animation-presets')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/frames/preview-range')) {
      return route.fulfill({
        json: {
          frames: [
            { id: 'f1', capture_time: '2024-06-15T12:00:00Z', thumbnail_url: '/thumb/1', satellite: 'GOES-16', band: 'C02', sector: 'CONUS' },
            { id: 'f2', capture_time: '2024-06-15T12:10:00Z', thumbnail_url: '/thumb/2', satellite: 'GOES-16', band: 'C02', sector: 'CONUS' },
            { id: 'f3', capture_time: '2024-06-15T12:20:00Z', thumbnail_url: '/thumb/3', satellite: 'GOES-16', band: 'C02', sector: 'CONUS' },
          ],
          total_count: 12,
          capture_interval_minutes: 10,
        },
      });
    }
    if (url.includes('/api/goes/animations/from-range')) return route.fulfill({ json: { id: 'anim-1', status: 'pending', frame_count: 12 } });
    if (url.includes('/api/goes/animations/recent')) return route.fulfill({ json: { id: 'anim-2', status: 'pending', frame_count: 6 } });
    if (url.includes('/api/goes/animations/batch')) return route.fulfill({ json: { ids: ['batch-1'], status: 'queued' } });
    if (url.includes('/api/goes/animations')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/goes/frames')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 50 } });
    if (url.includes('/api/goes/collections')) return route.fulfill({ json: [] });
    if (url.includes('/api/goes/tags')) return route.fulfill({ json: [] });
    if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/system/status')) return route.fulfill({ json: { cpu_percent: 10, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } } });
    return route.fulfill({ json: {} });
  });
});

test('navigate to Animate tab', async ({ page }) => {
  await page.goto('/');
  // Navigate to GOES Data page which has Animate tab
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /animate/i }).click();
  await expect(page.getByText(/GOES-16/)).toBeVisible();
});

test('quick hour buttons populate date range', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /animate/i }).click();

  // Click a quick hours button
  await page.getByRole('button', { name: '3h' }).click();

  // Date inputs should now have values
  const startInput = page.locator('input[type="datetime-local"]').first();
  await expect(startInput).not.toHaveValue('');
});

test('generate button exists on animate tab', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /animate/i }).click();

  const genBtn = page.getByRole('button', { name: /generate/i });
  await expect(genBtn).toBeVisible();
});

test('preview section shows frame count after date selection', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /animate/i }).click();

  // Set date range via quick hours
  await page.getByRole('button', { name: '1h' }).click();

  // Wait for preview to load — should show frame count
  await expect(page.getByText(/12 frames/i)).toBeVisible({ timeout: 5000 });
});

test('animation list section is present', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /goes/i }).first().click();
  await page.getByRole('tab', { name: /animate/i }).click();

  // Should show animations list or "no animations" state
  await expect(page.getByText(/animation/i).first()).toBeVisible();
});
