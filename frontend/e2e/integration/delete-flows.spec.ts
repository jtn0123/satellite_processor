import { test, expect } from '@playwright/test';
import { apiPost, apiGet, apiDelete, apiDeleteNoAuth, waitForApiHealth, waitForJob, buildFetchRequest } from './helpers';

test.describe('Delete flows', () => {
  test.describe.configure({ mode: 'serial' });

  let frameId: string | undefined;
  let jobId: string | undefined;

  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
    // Fetch frames so we have data to delete
    const fetchReq = buildFetchRequest();
    const res = await apiPost(request, '/api/goes/fetch', fetchReq);
    if (res.status < 300) {
      const body = res.body as Record<string, unknown>;
      jobId = (body.job_id ?? body.id) as string | undefined;
      if (jobId) {
        await waitForJob(request, jobId, 120_000);
      }
    }
  });

  test('delete a frame via API and verify removal', async ({ request }) => {
    const framesRes = await apiGet(request, '/api/goes/frames');
    const framesBody = framesRes.body as Record<string, unknown>;
    const items = (framesBody.items ?? framesBody) as Array<Record<string, unknown>>;
    if (!Array.isArray(items) || items.length === 0) {
      test.skip(true, 'No frames available to delete');
      return;
    }

    frameId = items[0].id as string;
    const deleteRes = await apiDelete(request, `/api/goes/frames/${frameId}`);
    expect([200, 204]).toContain(deleteRes.status);

    // Verify it's gone
    const afterRes = await apiGet(request, '/api/goes/frames');
    const afterBody = afterRes.body as Record<string, unknown>;
    const afterItems = (afterBody.items ?? afterBody) as Array<Record<string, unknown>>;
    if (Array.isArray(afterItems)) {
      const found = afterItems.find((f) => f.id === frameId);
      expect(found).toBeUndefined();
    }
  });

  test('delete a job via API and verify removal', async ({ request }) => {
    // Get a job to delete
    const jobsRes = await apiGet(request, '/api/jobs');
    const jobs = jobsRes.body as Array<Record<string, unknown>>;
    if (!Array.isArray(jobs) || jobs.length === 0) {
      test.skip(true, 'No jobs available to delete');
      return;
    }

    const targetJobId = (jobs[0].id ?? jobs[0].job_id) as string;
    const deleteRes = await apiDelete(request, `/api/jobs/${targetJobId}`);
    expect([200, 204]).toContain(deleteRes.status);

    // Verify removal
    const afterRes = await apiGet(request, '/api/jobs');
    const afterJobs = afterRes.body as Array<Record<string, unknown>>;
    if (Array.isArray(afterJobs)) {
      const found = afterJobs.find((j) => (j.id ?? j.job_id) === targetJobId);
      expect(found).toBeUndefined();
    }
  });

  test('delete requires auth — 401 without API key', async ({ request }) => {
    const res = await apiDeleteNoAuth(request, '/api/goes/frames/some-fake-id');
    // Should be 401 or 403 without auth
    expect([401, 403]).toContain(res.status);
  });

  test('deleting non-existent resource returns appropriate error', async ({ request }) => {
    const res = await apiDelete(request, '/api/goes/frames/nonexistent-id-12345');
    expect([404, 422]).toContain(res.status);
    // Response should be JSON
    expect(typeof res.body).toBe('object');
  });
});
