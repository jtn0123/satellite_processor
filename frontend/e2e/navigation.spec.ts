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
  const sidebar = page.locator('aside');
  await sidebar.getByText('Upload').click();
  await expect(page).toHaveURL(/upload/);
  await sidebar.getByText('Jobs').click();
  await expect(page).toHaveURL(/jobs/);
  await sidebar.getByText('Dashboard').click();
  await expect(page).toHaveURL('/');
});
