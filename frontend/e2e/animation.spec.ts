import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('GOES Data page loads with 7 tabs', async ({ page }) => {
  await page.goto('/goes');
  await expect(page.locator('[role="tablist"]')).toBeVisible();
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(10);
});

test('Overview tab is default', async ({ page }) => {
  await page.goto('/goes');
  const overviewTab = page.locator('[role="tab"]').filter({ hasText: /overview/i }).first();
  await expect(overviewTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Gallery tab', async ({ page }) => {
  await page.goto('/goes');
  const galleryTab = page.locator('[role="tab"]').filter({ hasText: /gallery/i }).first();
  await galleryTab.click();
  await expect(galleryTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Fetch tab', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  await expect(fetchTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Animate tab', async ({ page }) => {
  await page.goto('/goes');
  const animateTab = page.locator('[role="tab"]').filter({ hasText: /animate/i }).first();
  await animateTab.click();
  await expect(animateTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Map tab', async ({ page }) => {
  await page.goto('/goes');
  const mapTab = page.locator('[role="tab"]').filter({ hasText: /map/i }).first();
  await mapTab.click();
  await expect(mapTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Live tab', async ({ page }) => {
  await page.goto('/goes');
  const liveTab = page.locator('[role="tab"]').filter({ hasText: /live/i }).first();
  await liveTab.click();
  await expect(liveTab).toHaveAttribute('aria-selected', 'true');
});

test('navigate to Browse tab', async ({ page }) => {
  await page.goto('/goes');
  const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
  await browseTab.click();
  await expect(browseTab).toHaveAttribute('aria-selected', 'true');
});
