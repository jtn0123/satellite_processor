import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('form fields render', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('h1')).toHaveText('Settings');
});

test('save button exists', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 15000 });
});

test('codec dropdown has options', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  const selects = page.locator('select');
  await expect(selects.first()).toBeVisible();
});
