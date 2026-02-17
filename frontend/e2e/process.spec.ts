import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('process page loads', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('h1:has-text("Process Images")')).toBeVisible();
});

test('shows Select Images heading', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('text=Select Images').first()).toBeVisible();
});

test('shows empty gallery when no images', async ({ page }) => {
  await page.goto('/process');
  await expect(page.locator('text=No images yet')).toBeVisible();
});
