import { type Page, type APIRequestContext, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://localhost:8001';
const API_KEY = process.env.API_KEY ?? 'LI6pNdI77r7XNCsi0FgjQmVPr7ox2efm2oPHN-GpUws';

/**
 * Returns default headers for authenticated API requests.
 */
export function apiHeaders(): Record<string, string> {
  return {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json',
  };
}

/**
 * Wait until the API health endpoint responds 200.
 * Useful at the start of a test suite to gate on stack readiness.
 */
export async function waitForApiHealth(
  request: APIRequestContext,
  { timeoutMs = 60_000, intervalMs = 2_000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await request.get(`${API_BASE}/api/health`);
      if (res.ok()) return;
    } catch {
      // Connection refused — stack still starting
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`API did not become healthy within ${timeoutMs}ms`);
}

/**
 * Dismiss the "What's New" modal if it appears, so it doesn't block tests.
 */
export async function dismissWhatsNew(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('whatsNewLastSeen', '999.0.0');
  });
}

/**
 * Make authenticated API calls via the Playwright request context.
 */
export async function apiGet(request: APIRequestContext, path: string) {
  return request.get(`${API_BASE}${path}`, { headers: apiHeaders() });
}

export async function apiPost(
  request: APIRequestContext,
  path: string,
  data?: Record<string, unknown>,
) {
  return request.post(`${API_BASE}${path}`, {
    headers: apiHeaders(),
    data,
  });
}

export async function apiDelete(request: APIRequestContext, path: string) {
  return request.delete(`${API_BASE}${path}`, { headers: apiHeaders() });
}

/**
 * Navigate to a page, dismissing the What's New modal first.
 */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await dismissWhatsNew(page);
  await page.goto(path, { waitUntil: 'networkidle' });
  // Double-check: dismiss modal via Escape if it still appeared
  const modal = page.locator('dialog[open]');
  if ((await modal.count()) > 0) {
    await page.keyboard.press('Escape');
    await modal.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {});
  }
}

/**
 * Poll a job until it reaches a terminal state or timeout.
 */
export async function waitForJob(
  request: APIRequestContext,
  jobId: string,
  { timeoutMs = 120_000, intervalMs = 3_000 } = {},
): Promise<{ status: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await apiGet(request, `/api/jobs/${jobId}`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { status: string };
    if (['completed', 'failed', 'cancelled'].includes(body.status)) {
      return body;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Job ${jobId} did not complete within ${timeoutMs}ms`);
}
