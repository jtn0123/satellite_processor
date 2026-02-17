import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('upload page renders drop zone', async ({ page }) => {
  await page.goto('/upload');
  // The UploadZone component should be visible
  await expect(page.locator('h1:has-text("Upload Images")')).toBeVisible();
});

test('shows Image Library section', async ({ page }) => {
  await page.goto('/upload');
  await expect(page.locator('text=Image Library')).toBeVisible();
});

test('drop zone has upload text', async ({ page }) => {
  await page.goto('/upload');
  await expect(page.locator('text=Drag & drop satellite images here').first()).toBeVisible();
});
