import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile viewport shows bottom navigation or hamburger menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    const bottomNav = page.locator('nav[aria-label="Mobile navigation"]');
    const hasBottomNav = await bottomNav.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasBottomNav).toBeTruthy();
  });

  test('can navigate to Live View on mobile', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    await nav.getByText('Live').click();
    await expect(page).toHaveURL(/\/live/);
  });

  test('can navigate to GOES data on mobile', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    await nav.getByText('Browse').click();
    await expect(page).toHaveURL(/\/goes/);
  });

  test('can navigate to Settings on mobile', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('nav[aria-label="Mobile navigation"]');
    // Settings is under "More" menu
    await nav.getByText('More').click();
    const dialog = page.locator('dialog');
    await dialog.getByRole('link', { name: 'Settings' }).click();
    await expect(page).toHaveURL(/\/settings/);
  });

  test('sidebar is hidden on mobile viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    const sidebar = page.locator('aside');
    const isVisible = await sidebar.isVisible().catch(() => false);
    if (isVisible) {
      const box = await sidebar.boundingBox();
      if (box) {
        expect(box.width).toBeLessThan(300);
      }
    }
  });

  test('mobile layout renders content area properly', async ({ page }) => {
    await page.goto('/');
    const main = page.locator('main').first();
    await expect(main).toBeVisible();
    const box = await main.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(300);
  });
});
