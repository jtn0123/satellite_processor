import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Mock frames endpoint with data for browse/gallery
  await page.route('**/api/goes/frames**', async (route) => {
    const url = route.request().url();
    if (url.includes('/image') || url.includes('/thumbnail')) {
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      return route.fulfill({ contentType: 'image/png', body: pixel });
    }
    await route.fulfill({
      json: {
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
      },
    });
  });
});

test.describe('View frame details', () => {
  test('gallery tab shows frame cards', async ({ page }) => {
    await page.goto('/goes');
    const galleryTab = page.locator('[role="tab"]').filter({ hasText: /gallery/i }).first();
    await galleryTab.click();
    // Frame data should be visible
    await expect(page.locator('text=GOES-19').first()).toBeVisible({ timeout: 5000 });
  });

  test('browse tab shows frames', async ({ page }) => {
    await page.goto('/goes');
    const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
    await browseTab.click();
    await expect(page.locator('text=GOES-19').first()).toBeVisible({ timeout: 5000 });
  });
});
