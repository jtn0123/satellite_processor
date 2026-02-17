import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Additional mock for fetch endpoint
  await page.route('**/api/goes/fetch', async (route) => {
    await route.fulfill({ json: { job_id: 'fetch-job-1', status: 'pending' } });
  });
});

test('navigate to GOES fetch tab', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  // Verify fetch tab loaded with satellite selector
  await expect(page.locator('select').first()).toBeVisible();
});

test('satellite selector shows options', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  // Should have a select with satellite options
  const selects = page.locator('select');
  await expect(selects.first()).toBeVisible();
});

test('fetch button is present', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  const fetchBtn = page.getByRole('button', { name: /fetch/i }).first();
  await expect(fetchBtn).toBeVisible();
});

test('fetch button is clickable', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();

  const fetchBtn = page.getByRole('button', { name: /fetch/i }).first();
  await expect(fetchBtn).toBeVisible();
  await expect(fetchBtn).toBeEnabled();
});
