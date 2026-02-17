import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Mock fetch and fetch-composite endpoints
  await page.route('**/api/goes/fetch', async (route) => {
    await route.fulfill({ json: { job_id: 'fetch-job-1', status: 'pending', message: 'ok' } });
  });
  await page.route('**/api/goes/fetch-composite', async (route) => {
    await route.fulfill({ json: { job_id: 'composite-job-1', status: 'pending', message: 'ok' } });
  });
  await page.route('**/api/jobs**', async (route) => {
    await route.fulfill({ json: { items: [], total: 0 } });
  });
});

test('navigate to GOES fetch tab and see wizard', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  // Wizard step indicators should be visible
  await expect(page.getByText('Source')).toBeVisible();
  await expect(page.getByText('What')).toBeVisible();
  await expect(page.getByText('When')).toBeVisible();
});

test('satellite cards are shown on step 1', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  await expect(page.getByText('GOES-19')).toBeVisible();
  await expect(page.getByText('Choose Satellite')).toBeVisible();
});

test('Fetch Latest button is visible', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  await expect(page.getByText('Fetch Latest')).toBeVisible();
});

test('navigate through wizard steps', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  // Step 1 → Step 2
  await page.getByText('Next').click();
  await expect(page.getByText('What to Fetch')).toBeVisible();
  // Step 2 → Step 3
  await page.getByText('Next').click();
  await expect(page.getByText('When')).toBeVisible();
});

test('image type toggle works', async ({ page }) => {
  await page.goto('/goes');
  const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
  await fetchTab.click();
  await page.getByText('Next').click();
  await expect(page.getByText('Single Band')).toBeVisible();
  await expect(page.getByText('True Color')).toBeVisible();
  await page.getByText('True Color').click();
  // Should show info about auto-fetching bands
  await expect(page.getByText(/C01 \+ C02 \+ C03/)).toBeVisible();
});
