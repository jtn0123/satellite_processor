import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Dashboard → Fetch flow', () => {
  test('dashboard loads with heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('dashboard shows GOES Frames stat', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/GOES Frames/i').first()).toBeVisible();
  });

  test('dashboard shows Total Jobs stat', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/Total Jobs/i').first()).toBeVisible();
  });

  test('dashboard has Fetch Latest CONUS action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Fetch Latest CONUS')).toBeVisible();
  });

  test('navigate from dashboard to GOES via sidebar', async ({ page }) => {
    await page.goto('/');
    const sidebar = page.locator('aside');
    await sidebar.getByText('Browse & Fetch').click();
    await expect(page).toHaveURL(/goes/);
  });

  test('GOES page fetch tab has quick-fetch chips', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();
    await expect(page.getByText('CONUS Last Hour')).toBeVisible();
  });

  test('quick fetch chip is clickable', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();
    const chip = page.getByText('CONUS Last Hour');
    await expect(chip).toBeVisible();
    await expect(chip).toBeEnabled();
  });
});
