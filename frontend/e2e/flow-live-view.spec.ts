import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Live flow', () => {
  test('live view page loads with heading', async ({ page }) => {
    await page.goto('/live');
    await expect(page.locator('h1')).toContainText('Live');
  });

  test('live view shows satellite selector', async ({ page }) => {
    await page.goto('/live');
    const select = page.locator('select[aria-label="Satellite"]');
    await expect(select).toBeVisible({ timeout: 10000 });
  });

  test('live view has auto-fetch toggle', async ({ page }) => {
    await page.goto('/live');
    // Auto-fetch checkbox is in the control bar (hidden on small viewports)
    await expect(page.getByText('Auto-fetch')).toBeVisible({ timeout: 10000 });
  });

  test('live view has compare option', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('Compare')).toBeVisible({ timeout: 10000 });
  });

  test('live view has refresh button', async ({ page }) => {
    await page.goto('/live');
    await expect(page.locator('button[aria-label="Refresh now"]')).toBeVisible({ timeout: 10000 });
  });

  test('live view has refresh interval selector', async ({ page }) => {
    await page.goto('/live');
    const select = page.locator('select[aria-label="Auto-refresh interval"]');
    await expect(select).toBeVisible({ timeout: 10000 });
  });

  test('live view survives reload', async ({ page }) => {
    await page.goto('/live');
    await expect(page.locator('h1')).toContainText('Live');
    await page.reload();
    await expect(page.locator('h1')).toContainText('Live');
  });
});
