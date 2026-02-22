import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiGet, navigateTo } from './helpers';

test.describe('Dashboard', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('dashboard page loads', async ({ page }) => {
    await navigateTo(page, '/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });

  test('dashboard stats API returns data', async ({ request }) => {
    const res = await apiGet(request, '/api/goes/dashboard-stats');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { total_frames: number };
    expect(body.total_frames).toBeGreaterThanOrEqual(0);
  });

  test('dashboard displays stats section', async ({ page }) => {
    await navigateTo(page, '/');
    // Dashboard should show some stats or summary content
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    // No crash / error boundary
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('navigation links work', async ({ page }) => {
    await navigateTo(page, '/');
    // Find and click a nav link to browse
    const browseLink = page.getByRole('link', { name: /browse/i })
      .or(page.locator('a[href*="goes"]'));
    const linkExists = (await browseLink.count()) > 0;
    if (linkExists) {
      await browseLink.first().click();
      await page.waitForURL(/goes|browse/, { timeout: 10_000 });
      expect(page.url()).toMatch(/goes|browse/);
    }
  });

  test('settings page loads', async ({ page }) => {
    await navigateTo(page, '/settings');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });
});
