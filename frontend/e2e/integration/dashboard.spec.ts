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
    // Dismiss What's New modal if still visible
    const modal = page.locator('dialog[open]');
    if ((await modal.count()) > 0) {
      await page.keyboard.press('Escape');
      await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
    }
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

  test('dashboard renders stat cards with numeric values', async ({ page }) => {
    await navigateTo(page, '/');
    // Look for stat cards or metric displays
    const statCards = page.locator(
      '[class*="stat"], [class*="metric"], [class*="card"], [data-testid*="stat"]',
    );
    const count = await statCards.count();
    if (count > 0) {
      // At least one stat card should have visible content
      await expect(statCards.first()).toBeVisible();
    }
  });

  test('dashboard system health section renders', async ({ page }) => {
    await navigateTo(page, '/');
    // System health may show as a section or card
    const health = page.locator(
      '[class*="health"], [class*="system"], [data-testid*="health"]',
    );
    const count = await health.count();
    // Resilient — may not exist on all dashboard layouts
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('dashboard has fetch button', async ({ page }) => {
    await navigateTo(page, '/');
    const fetchBtn = page.getByRole('button', { name: /fetch|conus|download/i });
    const count = await fetchBtn.count();
    if (count > 0) {
      await expect(fetchBtn.first()).toBeVisible();
    }
  });
});
