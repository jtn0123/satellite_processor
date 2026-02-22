import { type Page, type APIRequestContext, expect } from '@playwright/test';

const API_BASE = process.env.API_BASE ?? 'http://localhost:8000';
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.API_KEY ?? 'LI6pNdI77r7XNCsi0FgjQmVPr7ox2efm2oPHN-GpUws';

export { API_BASE, BASE_URL, API_KEY };

/** Navigate to a frontend route and dismiss any modals */
export async function navigateTo(page: Page, path: string): Promise<void> {
  await page.goto(`${BASE_URL}${path}`, { waitUntil: 'networkidle', timeout: 15_000 });
  // Dismiss whats-new modal if present
  const modal = page.locator('[data-testid="whats-new-modal"] button, .modal-close, [aria-label="Close"]').first();
  if (await modal.isVisible({ timeout: 1_000 }).catch(() => false)) {
    await modal.click();
  }
}

/** Make an authenticated GET request */
export async function apiGet(request: APIRequestContext, path: string): Promise<{
  status: number;
  body: unknown;
}> {
  const res = await request.get(`${API_BASE}${path}`, {
    headers: { 'X-API-Key': API_KEY },
    timeout: 30_000,
  });
  const body: unknown = await res.json().catch(() => res.text());
  return { status: res.status(), body };
}

/** Make an authenticated POST request */
export async function apiPost(request: APIRequestContext, path: string, data?: unknown): Promise<{
  status: number;
  body: unknown;
}> {
  const res = await request.post(`${API_BASE}${path}`, {
    headers: { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' },
    data: data !== undefined ? JSON.stringify(data) : undefined,
    timeout: 30_000,
  });
  const body: unknown = await res.json().catch(() => res.text());
  return { status: res.status(), body };
}

/** Make an authenticated DELETE request */
export async function apiDelete(request: APIRequestContext, path: string): Promise<{
  status: number;
  body: unknown;
}> {
  const res = await request.delete(`${API_BASE}${path}`, {
    headers: { 'X-API-Key': API_KEY },
    timeout: 30_000,
  });
  const body: unknown = await res.json().catch(() => res.text());
  return { status: res.status(), body };
}

/** Make a raw POST (no auth) */
export async function apiPostRaw(request: APIRequestContext, path: string, options: {
  data?: string;
  headers?: Record<string, string>;
}): Promise<{ status: number; body: unknown }> {
  const res = await request.post(`${API_BASE}${path}`, {
    headers: options.headers ?? {},
    data: options.data,
    timeout: 30_000,
  });
  const body: unknown = await res.json().catch(() => res.text());
  return { status: res.status(), body };
}

/** Make an unauthenticated DELETE request */
export async function apiDeleteNoAuth(request: APIRequestContext, path: string): Promise<{
  status: number;
  body: unknown;
}> {
  const res = await request.delete(`${API_BASE}${path}`, { timeout: 30_000 });
  const body: unknown = await res.json().catch(() => res.text());
  return { status: res.status(), body };
}

/** Wait for API health check to succeed */
export async function waitForApiHealth(request: APIRequestContext, maxWaitMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await request.get(`${API_BASE}/api/health`, { timeout: 5_000 });
      if (res.ok()) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1_000));
  }
  throw new Error(`API not healthy after ${maxWaitMs}ms`);
}

/** Poll a job until it completes or times out */
export async function waitForJob(
  request: APIRequestContext,
  jobId: string,
  timeoutMs = 120_000,
): Promise<{ status: string; body: unknown }> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const res = await apiGet(request, `/api/jobs`);
    const jobs = res.body;
    if (Array.isArray(jobs)) {
      const job = jobs.find((j: Record<string, unknown>) => j.id === jobId || j.job_id === jobId);
      if (job) {
        const st = (job as Record<string, unknown>).status as string;
        if (st === 'completed' || st === 'failed' || st === 'error') {
          return { status: st, body: job };
        }
      }
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return { status: 'timeout', body: null };
}

/** Build a GoesFetchRequest with sensible defaults (recent 1-hour window) */
export function buildFetchRequest(overrides?: Partial<{
  satellite: string;
  sector: string;
  band: string;
  start_time: string;
  end_time: string;
}>): Record<string, string> {
  const end = new Date();
  const start = new Date(end.getTime() - 60 * 60 * 1000);
  return {
    satellite: 'GOES-19',
    sector: 'CONUS',
    band: 'C02',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    ...overrides,
  };
}
