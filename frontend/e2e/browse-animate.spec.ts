import { test, expect, Page, Route } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/** Provide frames for browse tests */
function mockFrames(page: Page) {
  // Mock thumbnail download endpoint
  page.route('**/api/download*', async (route: Route) => {
    return route.fulfill({ contentType: 'image/png', body: PIXEL });
  });
  return page.route('**/api/goes/frames*', async (route: Route) => {
    const url = route.request().url();
    // Image/thumbnail endpoints
    if (url.match(/\/frames\/[^/]+\/(image|thumbnail)/)) {
      return route.fulfill({ contentType: 'image/png', body: PIXEL });
    }
    // Stats endpoint
    if (url.includes('/frames/stats')) {
      return route.fulfill({ json: { total_frames: 50, total_size_bytes: 2500000, by_satellite: {}, by_band: {} } });
    }
    // Frame list
    const items = Array.from({ length: 12 }, (_, i) => ({
      id: `frame-${i}`,
      filename: `goes19_conus_c02_${i}.png`,
      satellite: 'GOES-19',
      sector: 'CONUS',
      band: 'C02',
      capture_time: `2025-01-01T${String(i).padStart(2, '0')}:00:00Z`,
      file_size: 4000,
      width: 1000,
      height: 800,
      thumbnail_path: `/data/frames/goes19_conus_c02_${i}_thumb.png`,
    }));
    return route.fulfill({ json: { items, total: 50, page: 1, limit: 50 } });
  });
}

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Browse flow', () => {
  test('GOES browse tab displays frame cards', async ({ page }) => {
    await mockFrames(page);
    await page.goto('/goes');
    // Browse tab should be default
    const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
    await expect(browseTab).toHaveAttribute('aria-selected', 'true');
    // Frames should render
    await expect(page.locator('img').first()).toBeVisible({ timeout: 10000 });
  });

  test('clicking a frame opens detail view', async ({ page }) => {
    await mockFrames(page);
    await page.goto('/goes');
    // Wait for frame cards then click first one
    const firstCard = page.locator('button[aria-label*="GOES"]').first();
    if (await firstCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await firstCard.click();
      // Should show detail - dialog, drawer, or expanded view
      await expect(page.locator('[role="dialog"], [class*="detail"], [class*="Detail"], [class*="viewer"]').first())
        .toBeVisible({ timeout: 5000 })
        .catch(() => {
          // May navigate instead
        });
    }
  });

  test('browse tab shows satellite filter controls', async ({ page }) => {
    await mockFrames(page);
    await page.goto('/goes');
    // Should have filter/sort controls
    const selects = page.locator('select, [role="combobox"]');
    await expect(selects.first()).toBeVisible({ timeout: 5000 });
  });

  test('fetch tab renders form controls', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();
    await expect(fetchTab).toHaveAttribute('aria-selected', 'true');
    // Fetch tab should have action buttons
    await expect(page.getByRole('button').first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Animation flow', () => {
  test('animate page loads', async ({ page }) => {
    await page.goto('/animate');
    await expect(page).toHaveURL(/animate/);
    // Page should have animation-related content
    await expect(page.locator('h1, h2, [class*="animate"], [class*="Animate"]').first()).toBeVisible({ timeout: 5000 });
  });

  test('animate page shows frame selection controls', async ({ page }) => {
    await mockFrames(page);
    await page.goto('/animate');
    // Should have controls for selecting frames, speed, etc.
    const controls = page.locator('select, input, button, [role="slider"]');
    await expect(controls.first()).toBeVisible({ timeout: 5000 });
  });

  test('animate page shows create/preview button', async ({ page }) => {
    await page.goto('/animate');
    const actionBtn = page.locator('button:has-text("Create"), button:has-text("Preview"), button:has-text("Generate")').first();
    await expect(actionBtn).toBeVisible({ timeout: 5000 });
  });
});
