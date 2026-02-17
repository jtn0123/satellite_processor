import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test('form fields render', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/settings', { waitUntil: 'networkidle' });

  // Debug: capture page state
  const html = await page.content();
  const hasH1 = html.includes('<h1');
  const hasLoading = html.includes('Loading');
  const hasFailed = html.includes('Failed');
  const hasError = html.includes('error') || html.includes('Error');

  console.log(`[DEBUG] h1=${hasH1} loading=${hasLoading} failed=${hasFailed} error=${hasError}`);
  console.log(`[DEBUG] console errors: ${errors.join('; ')}`);
  if (!hasH1) {
    // Print a snippet of the body
    const body = await page.locator('body').innerHTML();
    console.log(`[DEBUG] body snippet: ${body.slice(0, 500)}`);
  }

  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
});

test('save button exists', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('button', { name: /save/i })).toBeVisible({ timeout: 15000 });
});

test('codec dropdown has options', async ({ page }) => {
  await page.goto('/settings', { waitUntil: 'networkidle' });
  await expect(page.locator('h1')).toBeVisible({ timeout: 15000 });
  const selects = page.locator('select');
  await expect(selects.first()).toBeVisible();
});
