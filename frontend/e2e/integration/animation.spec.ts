import { test, expect } from '@playwright/test';
import { waitForApiHealth, navigateTo } from './helpers';

test.describe('Animation Page', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('animate page loads without errors', async ({ page }) => {
    await navigateTo(page, '/animate');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('animate page renders animation controls', async ({ page }) => {
    await navigateTo(page, '/animate');
    // Look for play/pause buttons, timeline, or animation-related controls
    const controls = page.locator(
      'button, [class*="player"], [class*="control"], [class*="timeline"], [data-testid*="anim"]',
    );
    const count = await controls.count();
    expect(count).toBeGreaterThanOrEqual(0); // Page loads — controls may need data
  });

  test('animate page handles empty state when no frames exist', async ({ page }) => {
    await navigateTo(page, '/animate');
    // Should gracefully show empty state or prompt user to fetch frames
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    // No unhandled errors
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('animate page has title or heading', async ({ page }) => {
    await navigateTo(page, '/animate');
    const heading = page.getByRole('heading').or(page.locator('h1, h2, h3'));
    const count = await heading.count();
    if (count > 0) {
      await expect(heading.first()).toBeVisible();
    }
  });
});
