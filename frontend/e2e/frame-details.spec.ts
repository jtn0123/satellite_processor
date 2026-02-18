import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

const MOCK_FRAMES_RESPONSE = {
  items: [
    {
      id: 'frame-001',
      satellite: 'GOES-19',
      band: 'C02',
      sector: 'CONUS',
      capture_time: '2026-01-15T12:00:00Z',
      file_size: 4000000,
      resolution: '2km',
      filename: 'frame-001.nc',
    },
  ],
  total: 1,
  page: 1,
  limit: 50,
};

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);

  // Override frames endpoints with test data.
  // Must use a URL-checking callback to avoid catching /frames/stats
  // and /frames/:id/* which would break the component.
  await page.route('**/api/goes/frames**', async (route) => {
    const url = route.request().url();
    const path = new URL(url).pathname;

    // Let /frames/stats fall through to the next handler (setupMockApi)
    // Let /frames/:id/image and /frames/:id/thumbnail fall through too
    if (path !== '/api/goes/frames') {
      return route.fallback();
    }

    await route.fulfill({ json: MOCK_FRAMES_RESPONSE });
  });
});

test.describe('View frame details', () => {
  test('gallery tab shows frame cards', async ({ page }) => {
    await page.goto('/goes');
    const galleryTab = page.locator('[role="tab"]').filter({ hasText: /gallery/i }).first();
    await galleryTab.click();
    await expect(page.locator('text=GOES-19').first()).toBeVisible({ timeout: 5000 });
  });

  test('browse tab shows frames', async ({ page }) => {
    await page.goto('/goes');
    const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
    await browseTab.click();
    await expect(page.locator('text=GOES-19').first()).toBeVisible({ timeout: 5000 });
  });
});
