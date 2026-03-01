import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('upload route redirects to settings', async ({ page }) => {
  await page.goto('/upload');
  await expect(page).toHaveURL(/\/settings/);
});

test('settings page has Manual Upload section in Data tab', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Data tab' }).click();
  await expect(page.getByText('Manual Upload')).toBeVisible();
});

test('upload section is expandable in Data tab', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Data tab' }).click();
  const section = page.getByText('Manual Upload');
  await section.click();
  // After expanding, upload-related content should be visible
  await expect(page.getByText(/drag|drop|upload/i).first()).toBeVisible();
});
