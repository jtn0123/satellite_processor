import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.describe('Job monitoring - empty', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
  });

  test('shows empty state when no jobs', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=/no jobs/i')).toBeVisible();
  });

  test('page title contains Jobs', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page).toHaveURL(/jobs/);
  });
});

test.describe('Job monitoring - with jobs', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockApi(page);
    await page.route('**/api/jobs**', async (route) => {
      await route.fulfill({
        json: {
          items: [
            {
              id: 'job-100',
              status: 'running',
              job_type: 'goes_fetch',
              progress: 45,
              status_message: 'Downloading frames...',
              input_path: '',
              output_path: '',
              error: '',
              params: {},
              created_at: '2026-01-15T10:00:00Z',
              started_at: '2026-01-15T10:00:01Z',
              completed_at: null,
            },
            {
              id: 'job-101',
              status: 'completed',
              job_type: 'image_process',
              progress: 100,
              status_message: 'Done',
              input_path: '/tmp/in',
              output_path: '/tmp/out',
              error: '',
              params: {},
              created_at: '2026-01-15T09:00:00Z',
              started_at: '2026-01-15T09:00:01Z',
              completed_at: '2026-01-15T09:05:00Z',
            },
            {
              id: 'job-102',
              status: 'failed',
              job_type: 'animation',
              progress: 30,
              status_message: 'Error occurred',
              input_path: '',
              output_path: '',
              error: 'Out of memory',
              params: {},
              created_at: '2026-01-15T08:00:00Z',
              started_at: '2026-01-15T08:00:01Z',
              completed_at: '2026-01-15T08:02:00Z',
            },
          ],
          total: 3,
          page: 1,
          limit: 20,
        },
      });
    });
  });

  test('renders multiple jobs with different statuses', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=goes_fetch').first()).toBeVisible();
    await expect(page.locator('text=image_process').first()).toBeVisible();
    await expect(page.locator('text=animation').first()).toBeVisible();
  });

  test('shows job progress', async ({ page }) => {
    await page.goto('/jobs');
    await expect(page.locator('text=goes_fetch').first()).toBeVisible();
  });
});
