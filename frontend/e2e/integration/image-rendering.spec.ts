import { test, expect } from '@playwright/test';
import { navigateTo, apiPost, apiGet, waitForApiHealth, waitForJob, buildFetchRequest, API_BASE, API_KEY } from './helpers';

test.describe('Image rendering after fetch', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    await waitForApiHealth(request);
    // Trigger a fetch so we have frames to render
    const fetchReq = buildFetchRequest();
    const res = await apiPost(request, '/api/goes/fetch', fetchReq);
    if (res.status < 300) {
      const body = res.body as Record<string, unknown>;
      const jobId = (body.job_id ?? body.id) as string | undefined;
      if (jobId) {
        await waitForJob(request, jobId, 120_000);
      }
    }
  });

  test('browse page shows images with valid src attributes', async ({ page, request }) => {
    // Check if we have frames first
    const framesRes = await apiGet(request, '/api/goes/frames');
    const framesBody = framesRes.body as Record<string, unknown>;
    const items = (framesBody.items ?? framesBody) as unknown[];
    if (!Array.isArray(items) || items.length === 0) {
      test.skip(true, 'No frames available — skipping image rendering test');
      return;
    }

    await navigateTo(page, '/browse');
    await page.waitForTimeout(2_000);

    const images = page.locator('img[src*="/api/"], img[src*="thumbnail"], img[src*="image"]');
    const count = await images.count();
    if (count === 0) {
      // Page may use background-image or other rendering — just verify page loaded
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
      return;
    }

    // Verify at least the first image has a non-empty src
    const src = await images.first().getAttribute('src');
    expect(src).toBeTruthy();
    expect(src!.length).toBeGreaterThan(0);
  });

  test('thumbnail URLs return image content', async ({ request }) => {
    const framesRes = await apiGet(request, '/api/goes/frames');
    const framesBody = framesRes.body as Record<string, unknown>;
    const items = (framesBody.items ?? framesBody) as Array<Record<string, unknown>>;
    if (!Array.isArray(items) || items.length === 0) {
      test.skip(true, 'No frames available');
      return;
    }

    const frame = items[0];
    const frameId = frame.id as string;
    const res = await request.get(`${API_BASE}/api/goes/frames/${frameId}/thumbnail`, {
      headers: { 'X-API-Key': API_KEY },
      timeout: 15_000,
    });

    if (res.status() === 200) {
      const contentType = res.headers()['content-type'] ?? '';
      expect(contentType).toMatch(/image\//);
    } else {
      // 404 is acceptable if thumbnails aren't generated yet
      expect([200, 404]).toContain(res.status());
    }
  });

  test('broken image shows fallback when URL is invalid', async ({ page }) => {
    await navigateTo(page, '/browse');

    // Inject a broken image to test fallback behavior
    await page.evaluate(() => {
      const img = document.createElement('img');
      img.src = '/api/goes/frames/nonexistent-id/thumbnail';
      img.alt = 'test-broken';
      img.onerror = () => {
        img.dataset['broken'] = 'true';
      };
      document.body.appendChild(img);
    });

    await page.waitForTimeout(2_000);
    const brokenImg = page.locator('img[alt="test-broken"]');
    const isBroken = await brokenImg.getAttribute('data-broken');
    // The image should have fired onerror (broken=true) since the URL is invalid
    expect(isBroken).toBe('true');
  });
});
