import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('stats cards render', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
  // Stats widgets should be visible
  await expect(page.locator('text=/images/i').first()).toBeVisible();
});

test('quick action buttons navigate correctly', async ({ page }) => {
  await page.goto('/');
  // Look for action buttons that link to upload/process
  const uploadLink = page.locator('a[href="/upload"], button:has-text("Upload")').first();
  if (await uploadLink.isVisible()) {
    await uploadLink.click();
    await expect(page).toHaveURL(/upload/);
  }
});
