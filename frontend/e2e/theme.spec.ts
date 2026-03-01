import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('page loads with dark theme when system prefers dark', async ({ page }) => {
  // Emulate dark color scheme (Playwright defaults to light)
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveClass(/dark/);
});

test('page loads with light theme when system prefers light', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await expect(html).toHaveClass(/light/);
});

test('mobile viewport renders page content', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto('/');
  // On mobile, the mobile header is visible with menu button
  await expect(page.locator('header button[aria-label="Open menu"]')).toBeVisible();
});
