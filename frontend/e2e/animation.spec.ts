import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('GOES Data page loads', async ({ page }) => {
  await page.goto('/goes');
  // Should see the GOES Data page with tabs
  await expect(page.locator('[role="tablist"]')).toBeVisible();
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

test('navigate to Map tab', async ({ page }) => {
  await page.goto('/goes');
  const mapTab = page.locator('[role="tab"]').filter({ hasText: /map/i }).first();
  await mapTab.click();
  await expect(mapTab).toHaveAttribute('aria-selected', 'true');
});
