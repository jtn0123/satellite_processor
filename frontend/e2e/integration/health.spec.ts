import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiGet, navigateTo } from './helpers';

test.describe('Stack Health', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('API health endpoint returns ok', async ({ request }) => {
    const res = await apiGet(request, '/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  test('API version endpoint returns version', async ({ request }) => {
    const res = await apiGet(request, '/api/health/version');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { version: string };
    expect(body.version).toBeTruthy();
  });

  test('frontend loads successfully', async ({ page }) => {
    await navigateTo(page, '/');
    // The app should render — look for any main content
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    // Should not be an error page
    const title = await page.title();
    expect(title).not.toContain('Error');
  });

  test('WebSocket connects to the API', async ({ page }) => {
    const wsPromise = page.waitForEvent('websocket', { timeout: 15_000 });
    await navigateTo(page, '/');
    const ws = await wsPromise;
    expect(ws.url()).toContain('/ws');
  });

  test('GOES products endpoint returns satellite data', async ({ request }) => {
    const res = await apiGet(request, '/api/goes/products');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { satellites: string[] };
    expect(body.satellites.length).toBeGreaterThan(0);
  });
});
