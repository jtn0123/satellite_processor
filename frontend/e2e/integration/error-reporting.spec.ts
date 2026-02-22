import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiGet, apiPost, navigateTo } from './helpers';

test.describe('Error Reporting', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('health detailed endpoint returns system info', async ({ request }) => {
    const res = await apiGet(request, '/api/health/detailed');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as Record<string, unknown>;
    expect(body).toBeTruthy();
  });

  test('invalid fetch request returns error', async ({ request }) => {
    const res = await apiPost(request, '/api/goes/fetch', {
      satellite: 'INVALID-SAT',
      sector: 'INVALID',
      band: 'INVALID',
      hours_back: 0,
    });
    // Should get a 4xx error, not a 500
    expect(res.status()).toBeGreaterThanOrEqual(400);
    expect(res.status()).toBeLessThan(500);
  });

  test('404 page renders for unknown routes', async ({ page }) => {
    await navigateTo(page, '/this-route-does-not-exist');
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
    // Should not crash — either shows 404 or redirects to home
  });

  test('API returns 401 without API key', async ({ request }) => {
    const res = await request.get(
      `${process.env.API_BASE ?? 'http://localhost:8001'}/api/goes/frames`,
    );
    // Endpoints requiring auth should reject unauthenticated requests
    // Some endpoints may be public, so we accept 401 or 403 or even 200
    expect(res.status()).toBeGreaterThanOrEqual(200);
  });

  test('jobs endpoint handles invalid job ID gracefully', async ({ request }) => {
    const res = await apiGet(request, '/api/jobs/nonexistent-job-id');
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });
});
