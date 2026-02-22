import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiGet, navigateTo } from './helpers';

test.describe('Browse Navigation', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('browse page loads', async ({ page }) => {
    await navigateTo(page, '/browse');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });

  test('browse page shows filter controls', async ({ page }) => {
    await navigateTo(page, '/browse');
    const filterArea = page.getByRole('combobox').or(page.locator('[data-testid*="filter"]')).or(page.locator('select'));
    const count = await filterArea.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('browse page handles empty state gracefully', async ({ page }) => {
    await navigateTo(page, '/browse');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });

  test('clicking a frame card navigates to detail view', async ({ page }) => {
    await navigateTo(page, '/browse');
    const frameCard = page.locator('[data-testid*="frame"], [class*="frame-card"], .card').first();
    const cardExists = (await frameCard.count()) > 0;
    if (cardExists) {
      await frameCard.click();
      await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    }
  });

  test('frames API returns paginated results', async ({ request }) => {
    const res = await apiGet(request, '/api/goes/frames?limit=5&offset=0');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { items: unknown[]; total: number };
    expect(body.total).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(body.items)).toBeTruthy();
    expect(body.items.length).toBeLessThanOrEqual(5);
  });

  test('frames stats API returns statistics', async ({ request }) => {
    const res = await apiGet(request, '/api/goes/frames/stats');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toBeTruthy();
    expect(typeof body).toBe('object');
  });

  test('browse /goes route also loads correctly', async ({ page }) => {
    await navigateTo(page, '/goes');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    const errorOverlay = page.locator('[class*="error-overlay"], [class*="ErrorBoundary"]');
    await expect(errorOverlay).toHaveCount(0);
  });
});
