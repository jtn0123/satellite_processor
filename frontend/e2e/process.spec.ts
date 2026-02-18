import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('process route redirects to settings', async ({ page }) => {
  await page.goto('/process');
  await expect(page).toHaveURL(/\/settings/);
});

test('settings page has Processing section', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Processing Defaults' })).toBeVisible();
});
