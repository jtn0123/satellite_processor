import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.describe('Jobs page - empty state', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
  });

  test('shows empty state message', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=/no jobs/i')).toBeVisible();
  });
});

test.describe('Jobs page - with data', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    // Override jobs endpoint with test data
    await page.route('**/api/jobs**', async (route) => {
      await route.fulfill({
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
    });
  });

  test('job list renders with mocked data', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=image_process').first()).toBeVisible();
  });
});
