import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('page loads with dark theme by default', async ({ page }) => {
  await page.goto('/');
  // The app uses dark mode by default (space theme)
  const html = page.locator('html');
  const className = await html.getAttribute('class');
  // Should have dark class or no light class
  expect(className?.includes('light')).toBeFalsy();
});

test('mobile viewport renders page content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  // On mobile, the mobile header is visible with menu button
  await expect(page.locator('header button[aria-label="Open menu"]')).toBeVisible();
});
