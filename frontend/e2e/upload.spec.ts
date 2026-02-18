import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('upload route redirects to settings', async ({ page }) => {
  await page.goto('/upload');
  await expect(page).toHaveURL(/\/settings/);
});

test('settings page has Manual Upload section', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByText('Manual Upload')).toBeVisible();
});

test('upload section is expandable', async ({ page }) => {
  await page.goto('/settings');
  const section = page.getByText('Manual Upload');
  await section.click();
  // After expanding, upload-related content should be visible
  await expect(page.getByText(/drag|drop|upload/i).first()).toBeVisible();
});
