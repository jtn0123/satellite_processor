import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Browse frames flow', () => {
  test('GOES page loads with tabs', async ({ page }) => {
    await page.goto('/goes');
    const tablist = page.locator('[role="tablist"]').first();
    await expect(tablist).toBeVisible();
  });

  test('browse tab is selected by default', async ({ page }) => {
    await page.goto('/goes');
    const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
    await expect(browseTab).toHaveAttribute('aria-selected', 'true');
  });

  test('can switch to fetch tab', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();
    await expect(fetchTab).toHaveAttribute('aria-selected', 'true');
  });

  test('can switch to map tab', async ({ page }) => {
    await page.goto('/goes');
    const mapTab = page.locator('[role="tab"]').filter({ hasText: /map/i }).first();
    await mapTab.click();
    await expect(mapTab).toHaveAttribute('aria-selected', 'true');
  });

  test('can switch to stats tab', async ({ page }) => {
    await page.goto('/goes');
    const statsTab = page.locator('[role="tab"]').filter({ hasText: /stats/i }).first();
    await statsTab.click();
    await expect(statsTab).toHaveAttribute('aria-selected', 'true');
  });

  test('can cycle through all tabs', async ({ page }) => {
    await page.goto('/goes');
    for (const name of ['Fetch', 'Map', 'Stats', 'Browse']) {
      const tab = page.locator('[role="tab"]').filter({ hasText: new RegExp(name, 'i') }).first();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  });
});
