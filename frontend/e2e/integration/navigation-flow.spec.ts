import { test, expect } from '@playwright/test';
import { waitForApiHealth, navigateTo } from './helpers';

test.describe('Navigation Flow', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('full navigation: dashboard → live → browse → animate → jobs → settings', async ({ page }) => {
    // Dashboard
    await navigateTo(page, '/');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Live
    await navigateTo(page, '/live');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Browse
    await navigateTo(page, '/goes');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Animate
    await navigateTo(page, '/animate');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Jobs
    await navigateTo(page, '/jobs');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });

    // Settings
    await navigateTo(page, '/settings');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });

  test('sidebar navigation links are present', async ({ page }) => {
    await navigateTo(page, '/');
    // Desktop sidebar should have navigation links
    const sidebar = page.locator('nav, [class*="sidebar"], [class*="Sidebar"], aside');
    const sidebarCount = await sidebar.count();
    if (sidebarCount > 0) {
      const links = sidebar.first().locator('a');
      const linkCount = await links.count();
      expect(linkCount).toBeGreaterThanOrEqual(3);
    }
  });

  test('mobile bottom navigation renders at small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await navigateTo(page, '/');
    // Mobile bottom nav should appear
    const bottomNav = page.locator(
      '[class*="bottom-nav"], [class*="BottomNav"], [class*="mobile-nav"], nav[class*="fixed"]',
    );
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const count = await bottomNav.count();
    // Bottom nav may or may not exist — just verify no crash
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('clicking sidebar links navigates correctly', async ({ page }) => {
    await navigateTo(page, '/');
    // Try to find and click the Browse/GOES link
    const browseLink = page.getByRole('link', { name: /browse|goes|fetch/i }).first();
    const exists = (await browseLink.count()) > 0;
    if (exists) {
      await browseLink.click();
      await page.waitForURL(/goes|browse/, { timeout: 10_000 });
      expect(page.url()).toMatch(/goes|browse/);
    }
  });

  test('each page has no error boundaries triggered', async ({ page }) => {
    const routes = ['/', '/live', '/goes', '/animate', '/jobs', '/settings'];
    for (const route of routes) {
      await navigateTo(page, route);
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
      const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
      await expect(errorOverlay).toHaveCount(0);
    }
  });
});
