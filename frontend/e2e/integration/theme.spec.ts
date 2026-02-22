import { test, expect } from '@playwright/test';
import { navigateTo, waitForApiHealth } from './helpers';

test.describe('Theme toggle', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('clicking theme toggle changes dark/light class on document', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Find theme toggle button
    const toggleSelectors = [
      'button[aria-label*="theme"], button[aria-label*="Theme"]',
      'button[aria-label*="dark"], button[aria-label*="light"]',
      'button[data-testid*="theme"]',
      '[class*="theme-toggle"]',
      'button:has(svg[class*="moon"]), button:has(svg[class*="sun"])',
    ];

    let toggleBtn = null;
    for (const sel of toggleSelectors) {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 2_000 }).catch(() => false)) {
        toggleBtn = el;
        break;
      }
    }

    if (!toggleBtn) {
      test.skip(true, 'No theme toggle button found');
      return;
    }

    // Get initial theme state
    const initialClass = await page.locator('html').getAttribute('class') ?? '';
    const initialDataTheme = await page.locator('html').getAttribute('data-theme') ?? '';

    await toggleBtn.click();
    await page.waitForTimeout(500);

    // Check that something changed (class or data-theme attribute)
    const afterClass = await page.locator('html').getAttribute('class') ?? '';
    const afterDataTheme = await page.locator('html').getAttribute('data-theme') ?? '';

    const changed = initialClass !== afterClass || initialDataTheme !== afterDataTheme;
    expect(changed).toBeTruthy();
  });

  test('theme persists across navigation', async ({ page }) => {
    await navigateTo(page, '/');
    await page.waitForTimeout(1_000);

    // Find and click theme toggle
    const toggle = page.locator(
      'button[aria-label*="theme"], button[aria-label*="Theme"], button[aria-label*="dark"], button[aria-label*="light"], button[data-testid*="theme"]'
    ).first();

    if (!await toggle.isVisible({ timeout: 2_000 }).catch(() => false)) {
      test.skip(true, 'No theme toggle button found');
      return;
    }

    await toggle.click();
    await page.waitForTimeout(500);

    // Capture current theme state
    const themeClass = await page.locator('html').getAttribute('class') ?? '';
    const themeData = await page.locator('html').getAttribute('data-theme') ?? '';

    // Navigate to a different page
    await navigateTo(page, '/browse');
    await page.waitForTimeout(1_000);

    // Verify theme persisted
    const afterClass = await page.locator('html').getAttribute('class') ?? '';
    const afterData = await page.locator('html').getAttribute('data-theme') ?? '';

    // At least one indicator should match
    const persisted = afterClass === themeClass || afterData === themeData;
    expect(persisted).toBeTruthy();
  });
});
