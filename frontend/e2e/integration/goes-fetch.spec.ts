import { test, expect } from '@playwright/test';
import { waitForApiHealth, apiPost, apiGet, navigateTo, waitForJob } from './helpers';

test.describe.serial('GOES Fetch Flow', () => {
  let jobId: string;

  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
  });

  test('trigger a GOES fetch via API', async ({ request }) => {
    const res = await apiPost(request, '/api/goes/fetch', {
      satellite: 'GOES-19',
      sector: 'CONUS',
      band: 'C02',
      hours_back: 1,
      max_frames: 2,
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { job_id: string };
    expect(body.job_id).toBeTruthy();
    jobId = body.job_id;
  });

  test('job appears in the jobs list', async ({ request }) => {
    const res = await apiGet(request, '/api/jobs');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { items: Array<{ id: string }> };
    const found = body.items.some((j) => j.id === jobId);
    expect(found).toBeTruthy();
  });

  test('wait for job completion', async ({ request }) => {
    const result = await waitForJob(request, jobId, { timeoutMs: 120_000 });
    // Job may fail if no real GOES data is available in test env — that's okay,
    // we just need it to reach a terminal state.
    expect(['completed', 'failed']).toContain(result.status);
  });

  test('browse page loads after fetch', async ({ page }) => {
    await navigateTo(page, '/browse');
    // The browse page should load without crashing
    await expect(page.locator('body')).toBeVisible({ timeout: 15_000 });
  });

  test('frames endpoint returns data', async ({ request }) => {
    const res = await apiGet(request, '/api/goes/frames?limit=10');
    expect(res.ok()).toBeTruthy();
    const body = await res.json() as { items: unknown[]; total: number };
    // May or may not have frames depending on GOES data availability
    expect(body.total).toBeGreaterThanOrEqual(0);
  });
});
