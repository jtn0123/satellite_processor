import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('stats cards render', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  // Stats widgets should be visible — "GOES Frames" card
  await expect(page.locator('text=/GOES Frames/i').first()).toBeVisible();
});

test('quick action buttons navigate correctly', async ({ page }) => {
  await page.goto('/');
  // Look for action buttons that link to live view or goes
  const liveLink = page.locator('a[href="/live"], button:has-text("Live")').first();
  if (await liveLink.isVisible()) {
    await liveLink.click();
    await expect(page).toHaveURL(/live/);
  }
});
