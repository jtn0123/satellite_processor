import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('navigates to dashboard', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('text=Dashboard').first()).toBeVisible();
});

test('navigates to upload page', async ({ page }) => {
  await page.goto('/upload');
  await expect(page).toHaveURL(/upload/);
});

test('navigates to jobs page', async ({ page }) => {
  await page.goto('/jobs');
  await expect(page).toHaveURL(/jobs/);
});

test('navigates to settings page', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL(/settings/);
});

test('shows 404 for unknown routes', async ({ page }) => {
  await page.goto('/unknown-page');
  await expect(page.locator('text=404')).toBeVisible();
});

test('sidebar links work', async ({ page }) => {
  await page.goto('/');
  await page.click('text=Upload');
  await expect(page).toHaveURL(/upload/);
  await page.click('text=Jobs');
  await expect(page).toHaveURL(/jobs/);
  await page.click('text=Dashboard');
  await expect(page).toHaveURL('/');
});
