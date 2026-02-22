import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiGet, navigateTo } from './helpers';

test.describe('Settings Page', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('settings page loads without errors', async ({ page }) => {
    await navigateTo(page, '/settings');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('settings API returns current settings', async ({ request }) => {
    const res = await apiGet(request, '/api/settings');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe('object');
  });

  test('settings page renders section headings', async ({ page }) => {
    await navigateTo(page, '/settings');
    const headings = page.getByRole('heading').or(page.locator('h1, h2, h3, h4'));
    const count = await headings.count();
    // Settings page should have at least one section heading
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('settings page has form controls', async ({ page }) => {
    await navigateTo(page, '/settings');
    // Look for toggles, inputs, selects, or buttons
    const controls = page.locator(
      'input, select, button, [role="switch"], [role="checkbox"], [class*="toggle"]',
    );
    const count = await controls.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('system info endpoint returns data', async ({ request }) => {
    const res = await apiGet(request, '/api/system/info');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe('object');
  });
});
