import { test, expect } from '@playwright/test';

test.describe('Jobs page - empty state', () => {
  test.beforeEach(async ({ page }) => {
  // Dismiss WhatsNew modal
  await page.addInitScript(() => { localStorage.setItem("whatsNewLastSeen", "99.99.99"); });
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
    if (url.match(/\/api\/goes\/frames\/[^/]+\/image/) || url.match(/\/api\/goes\/frames\/[^/]+\/thumbnail/)) { return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }); }
      if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
      if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
      if (url.includes('/api/jobs')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
      if (url.includes('/api/system/status')) {
        return route.fulfill({
          json: { cpu_percent: 15, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
        });
      }
      if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
      if (url.includes('/api/presets')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/frames/preview-range')) return route.fulfill({ json: { frames: [], total_count: 0, capture_interval_minutes: 10 } });
  if (url.includes('/api/goes/animations/from-range')) return route.fulfill({ json: { id: 'mock-1', status: 'pending' } });
  if (url.includes('/api/goes/animations/recent')) return route.fulfill({ json: { id: 'mock-2', status: 'pending' } });
  if (url.includes('/api/goes/animations/batch')) return route.fulfill({ json: { ids: [], status: 'queued' } });
  if (url.includes('/api/goes/animation-presets')) return route.fulfill({ json: [] });
      return route.continue();
    });
  });

  test('shows empty state message', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=/no jobs/i')).toBeVisible();
  });
});

test.describe('Jobs page - with data', () => {
  test.beforeEach(async ({ page }) => {
  // Dismiss WhatsNew modal
    await page.route('**/api/**', async (route) => {
      const url = route.request().url();
    if (url.match(/\/api\/goes\/frames\/[^/]+\/image/) || url.match(/\/api\/goes\/frames\/[^/]+\/thumbnail/)) { return route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') }); }
      if (url.includes('/api/health')) return route.fulfill({ json: { status: 'ok' } });
      if (url.includes('/api/images')) return route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
      if (url.includes('/api/jobs')) {
        return route.fulfill({
          json: { items: [
            {
              id: 'job-001',
              status: 'completed',
              job_type: 'image_process',
              progress: 100,
              status_message: 'Done',
              input_path: '/tmp/test',
              output_path: '/output/job-001',
              error: '',
              params: {},
              created_at: '2026-01-01T00:00:00Z',
              started_at: '2026-01-01T00:00:01Z',
              completed_at: '2026-01-01T00:01:00Z',
            },
          ], total: 1, page: 1, limit: 20 },
        });
      }
      if (url.includes('/api/system/status')) {
        return route.fulfill({
          json: { cpu_percent: 15, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
        });
      }
      if (url.includes('/api/settings')) return route.fulfill({ json: { video_fps: 24, video_codec: 'h264' } });
      if (url.includes('/api/presets')) return route.fulfill({ json: [] });
      if (url.includes('/api/notifications')) return route.fulfill({ json: [] });
  if (url.includes('/api/goes/frames/preview-range')) return route.fulfill({ json: { frames: [], total_count: 0, capture_interval_minutes: 10 } });
  if (url.includes('/api/goes/animations/from-range')) return route.fulfill({ json: { id: 'mock-1', status: 'pending' } });
  if (url.includes('/api/goes/animations/recent')) return route.fulfill({ json: { id: 'mock-2', status: 'pending' } });
  if (url.includes('/api/goes/animations/batch')) return route.fulfill({ json: { ids: [], status: 'queued' } });
  if (url.includes('/api/goes/animation-presets')) return route.fulfill({ json: [] });
      return route.continue();
    });
  });

  test('job list renders with mocked data', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=image_process').first()).toBeVisible();
  });
});
