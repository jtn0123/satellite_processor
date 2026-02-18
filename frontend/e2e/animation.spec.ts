import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('GOES Data page loads with 4 tabs', async ({ page }) => {
  await page.goto('/goes');
  await expect(page.locator('[role="tablist"]')).toBeVisible();
  const tabs = page.locator('[role="tab"]');
  await expect(tabs).toHaveCount(4);
});

test('Browse tab is default', async ({ page }) => {
  await page.goto('/goes');
  const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
  await expect(browseTab).toHaveAttribute('aria-selected', 'true');
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

test('navigate to Stats tab', async ({ page }) => {
  await page.goto('/goes');
  const statsTab = page.locator('[role="tab"]').filter({ hasText: /stats/i }).first();
  await statsTab.click();
  await expect(statsTab).toHaveAttribute('aria-selected', 'true');
});
