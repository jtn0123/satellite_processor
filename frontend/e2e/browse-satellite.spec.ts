import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Browse satellite data', () => {
  test('GOES page renders all tabs', async ({ page }) => {
    await page.goto('/goes');
    const tablist = page.locator('main [role="tablist"]').first();
    await expect(tablist).toBeVisible();
    const tabs = tablist.locator('[role="tab"]');
    await expect(tabs).toHaveCount(4);
  });

  test('Browse tab is selected by default', async ({ page }) => {
    await page.goto('/goes');
    const browseTab = page.locator('main [role="tab"]').filter({ hasText: /browse/i }).first();
    await expect(browseTab).toHaveAttribute('aria-selected', 'true');
  });

  test('can cycle through multiple tabs', async ({ page }) => {
    await page.goto('/goes');
    const tabNames = ['Fetch', 'Map', 'Stats', 'Browse'];
    for (const name of tabNames) {
      const tab = page.locator('main [role="tab"]').filter({ hasText: new RegExp(name, 'i') }).first();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  });
});
