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
    await expect(tabs).toHaveCount(10);
  });

  test('can switch from Overview to Browse tab', async ({ page }) => {
    await page.goto('/goes');
    const overviewTab = page.locator('[role="tab"]').filter({ hasText: /overview/i }).first();
    await expect(overviewTab).toHaveAttribute('aria-selected', 'true');

    const browseTab = page.locator('[role="tab"]').filter({ hasText: /browse/i }).first();
    await browseTab.click();
    await expect(browseTab).toHaveAttribute('aria-selected', 'true');
    await expect(overviewTab).toHaveAttribute('aria-selected', 'false');
  });

  test('can cycle through multiple tabs', async ({ page }) => {
    await page.goto('/goes');
    const tabNames = ['Gallery', 'Fetch', 'Animate', 'Browse'];
    for (const name of tabNames) {
      const tab = page.locator('[role="tab"]').filter({ hasText: new RegExp(name, 'i') }).first();
      await tab.click();
      await expect(tab).toHaveAttribute('aria-selected', 'true');
    }
  });
});
