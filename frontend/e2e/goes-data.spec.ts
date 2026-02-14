import { test, expect } from '@playwright/test';

const mockApiHandler = async (route: unknown) => {
  const url = route.request().url();
  if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
  if (url.includes('/api/goes/frames/stats')) {
    return route.fulfill({
      json: { total_frames: 100, total_size_bytes: 5000000, by_satellite: {}, by_band: {} },
    });
  }
  if (url.includes('/api/goes/frames')) {
    return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 50 } });
  }
  if (url.match(/\/api\/goes\/collections\/[^/]+\/frames/)) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/collections')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/tags')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/products')) {
    return route.fulfill({
      json: {
        satellites: ['GOES-16', 'GOES-18'],
        sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }],
        bands: [{ id: 'C02', description: 'Red (0.64µm)' }],
      },
    });
  }
  if (url.includes('/api/goes/fetch-presets')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/crop-presets')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/animations')) {
    return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
  }
  if (url.includes('/api/goes/cleanup-rules')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/schedules')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/composite-recipes')) {
    return route.fulfill({ json: [{ id: 'true_color', name: 'True Color', bands: ['C02', 'C03', 'C01'] }] });
  }
  if (url.includes('/api/goes/composites')) {
    return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
  }
  if (url.includes('/api/system/status')) {
    return route.fulfill({
      json: { cpu_percent: 10, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
    });
  }
  if (url.includes('/api/stats')) {
    return route.fulfill({ json: { total_images: 0, total_jobs: 0, active_jobs: 0, storage_used_mb: 0 } });
  }
  if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
  if (url.includes('/api/presets')) return route.fulfill({ json: [] });
  return route.continue();
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', mockApiHandler);
});

test('GOES data page loads', async ({ page }) => {
  await page.goto('/goes');
  await expect(page.locator('text=/GOES/i').first()).toBeVisible();
});

test('navigate to GOES data from sidebar', async ({ page }) => {
  await page.goto('/');
  const goesLink = page.locator('a[href="/goes"]').first();
  if (await goesLink.isVisible()) {
    await goesLink.click();
    await expect(page).toHaveURL(/goes/);
  }
});
