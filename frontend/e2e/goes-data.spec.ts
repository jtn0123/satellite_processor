import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('GOES data page loads', async ({ page }) => {
  await page.goto('/goes');
  await expect(page.locator('h1:has-text("Browse & Fetch")')).toBeVisible();
});

test('navigate to GOES data from sidebar', async ({ page }) => {
  await page.goto('/');
  const goesLink = page.locator('a[href="/goes"]').first();
  if (await goesLink.isVisible()) {
    await goesLink.click();
    await expect(page).toHaveURL(/goes/);
  }
});
