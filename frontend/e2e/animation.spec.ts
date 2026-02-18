import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('GOES Data page loads with 10 tabs', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  await expect(goesTablist).toBeVisible();
  const tabs = goesTablist.locator('[role="tab"]');
  await expect(tabs).toHaveCount(10);
});

test('Overview tab is default', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const overviewTab = goesTablist.locator('[role="tab"]').filter({ hasText: /overview/i }).first();
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Gallery tab', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const galleryTab = goesTablist.locator('[role="tab"]').filter({ hasText: /gallery/i }).first();
  await galleryTab.click();
  await expect(galleryTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Fetch tab', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const fetchTab = goesTablist.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  await expect(fetchTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Animate tab', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const animateTab = goesTablist.locator('[role="tab"]').filter({ hasText: /animate/i }).first();
  await animateTab.click();
  await expect(animateTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Map tab', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const mapTab = goesTablist.locator('[role="tab"]').filter({ hasText: /map/i }).first();
  await mapTab.click();
  await expect(mapTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Live tab', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const liveTab = goesTablist.locator('[role="tab"]').filter({ hasText: /live/i }).first();
  await liveTab.click();
  await expect(liveTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Browse tab', async ({ page }) => {
  await page.goto('/goes');
  const goesTablist = page.locator('[role="tablist"][aria-label="GOES Data tabs"]');
  const browseTab = goesTablist.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
  await browseTab.click();
  await expect(browseTab).toHaveAttribute('aria-selected', 'true');
});
