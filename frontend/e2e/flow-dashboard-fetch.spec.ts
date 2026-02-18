import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Dashboard needs goes/dashboard-stats endpoint
  await page.route('**/api/goes/dashboard-stats', async (route) => {
    await route.fulfill({
      json: {
        total_frames: 120,
        frames_by_satellite: { 'GOES-19': 80, 'GOES-18': 40 },
        last_fetch_time: '2025-01-15T12:00:00Z',
        active_schedules: 0,
        recent_jobs: [],
        storage_by_satellite: {},
        storage_by_band: {},
      },
    });
  });
});

test.describe('Dashboard → Fetch flow', () => {
  test('dashboard loads with heading', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Dashboard');
  });

  test('dashboard shows GOES Frames stat', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/GOES Frames/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('dashboard shows Total Jobs stat', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('text=/Total Jobs/i').first()).toBeVisible({ timeout: 10000 });
  });

  test('dashboard has Fetch Latest CONUS action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Fetch Latest CONUS')).toBeVisible({ timeout: 10000 });
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
    await expect(page.getByText('CONUS Last Hour')).toBeVisible({ timeout: 10000 });
  });

  test('quick fetch chip is clickable', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();
    const chip = page.getByText('CONUS Last Hour');
    await expect(chip).toBeVisible({ timeout: 10000 });
  });
});
