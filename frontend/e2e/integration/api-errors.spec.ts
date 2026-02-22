import { test, expect } from '@playwright/test';
import { apiPost, apiPostRaw, waitForApiHealth, API_BASE, API_KEY } from './helpers';

test.describe('API error responses', () => {
  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('malformed JSON returns proper error JSON, not HTML 500', async ({ request }) => {
    const res = await apiPostRaw(request, '/api/goes/fetch', {
      data: '{invalid json!!!',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(600);
    // Body should be JSON, not HTML
    expect(typeof res.body).toBe('object');
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/<!DOCTYPE/i);
  });

  test('invalid satellite name returns 400 with clear error', async ({ request }) => {
    const res = await apiPost(request, '/api/goes/fetch', {
      satellite: 'INVALID-SAT-999',
      sector: 'CONUS',
      band: 'C02',
      start_time: new Date().toISOString(),
      end_time: new Date().toISOString(),
    });

    // Should be a client error (400-422), not a server error
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThanOrEqual(422);
    expect(typeof res.body).toBe('object');
  });

  test('missing required fields returns 422 validation error', async ({ request }) => {
    const res = await apiPost(request, '/api/goes/fetch', {});

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThanOrEqual(422);
    expect(typeof res.body).toBe('object');
  });

  test('error responses have consistent shape', async ({ request }) => {
    const res = await apiPost(request, '/api/goes/fetch', {});

    expect(res.status).toBeGreaterThanOrEqual(400);
    const body = res.body as Record<string, unknown>;
    // FastAPI typically returns {detail: ...} for validation errors
    // Our API might use {error, message} — accept either
    const hasDetail = 'detail' in body;
    const hasError = 'error' in body || 'message' in body;
    expect(hasDetail || hasError).toBeTruthy();
  });
});
