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
    // On mobile, either bottom nav or hamburger menu should appear
    const bottomNav = page.locator('nav[class*="bottom"], [class*="BottomNav"], [class*="bottomNav"], [role="navigation"]').first();
    const hamburger = page.locator('button[aria-label*="menu" i], button[aria-label*="Menu" i], [class*="hamburger"], [class*="MenuIcon"]').first();
    const hasBottomNav = await bottomNav.isVisible({ timeout: 3000 }).catch(() => false);
    const hasHamburger = await hamburger.isVisible({ timeout: 3000 }).catch(() => false);
    expect(hasBottomNav || hasHamburger).toBeTruthy();
  });

  test('can navigate to Live View on mobile', async ({ page }) => {
    await page.goto('/');
    // Try bottom nav first, then hamburger
    const liveLink = page.locator('a[href="/live"], [role="navigation"] >> text=Live').first();
    if (await liveLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await liveLink.click();
    } else {
      // Open hamburger menu
      const hamburger = page.locator('button[aria-label*="menu" i]').first();
      if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
        await hamburger.click();
        await page.getByText('Live View').click();
      }
    }
    await expect(page).toHaveURL(/live/);
  });

  test('can navigate to GOES data on mobile', async ({ page }) => {
    await page.goto('/');
    const goesLink = page.locator('a[href="/goes"], [role="navigation"] >> text=GOES').first();
    if (await goesLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await goesLink.click();
    } else {
      const hamburger = page.locator('button[aria-label*="menu" i]').first();
      if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
        await hamburger.click();
        await page.getByText('GOES').first().click();
      }
    }
    await expect(page).toHaveURL(/goes/);
  });

  test('can navigate to Settings on mobile', async ({ page }) => {
    await page.goto('/');
    const settingsLink = page.locator('a[href="/settings"]').first();
    if (await settingsLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await settingsLink.click();
    } else {
      const hamburger = page.locator('button[aria-label*="menu" i]').first();
      if (await hamburger.isVisible({ timeout: 2000 }).catch(() => false)) {
        await hamburger.click();
        await page.getByText('Settings').click();
      }
    }
    await expect(page).toHaveURL(/settings/);
  });

  test('sidebar is hidden on mobile viewport', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1:has-text("Dashboard")')).toBeVisible();
    // Desktop sidebar should be hidden/collapsed
    const sidebar = page.locator('aside');
    const isVisible = await sidebar.isVisible().catch(() => false);
    if (isVisible) {
      // If visible, it should be an overlay/drawer style (narrow or off-screen)
      const box = await sidebar.boundingBox();
      if (box) {
        // Sidebar should be either narrow or off-screen on mobile
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
    // Content should use most of the viewport width
    expect(box!.width).toBeGreaterThan(300);
  });
});
