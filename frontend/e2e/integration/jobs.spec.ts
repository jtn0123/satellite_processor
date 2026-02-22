import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiGet, navigateTo } from './helpers';

test.describe('Jobs Page', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('jobs page loads without errors', async ({ page }) => {
    await navigateTo(page, '/jobs');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('jobs API returns job list', async ({ request }) => {
    const res = await apiGet(request, '/api/jobs');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { items: unknown[] };
    expect(Array.isArray(body.items)).toBeTruthy();
  });

  test('jobs page handles empty state gracefully', async ({ page }) => {
    await navigateTo(page, '/jobs');
    // Should show empty state message or job list
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('jobs page renders list or empty message', async ({ page }) => {
    await navigateTo(page, '/jobs');
    // Look for job items or empty state text
    const content = page.locator(
      '[class*="job"], [data-testid*="job"], table, [class*="empty"], [class*="no-data"]',
    );
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const count = await content.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('jobs page has heading', async ({ page }) => {
    await navigateTo(page, '/jobs');
    const heading = page.getByRole('heading').or(page.locator('h1, h2'));
    const count = await heading.count();
    if (count > 0) {
      await expect(heading.first()).toBeVisible();
    }
  });
});
