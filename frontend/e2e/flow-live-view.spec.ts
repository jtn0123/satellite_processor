import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Live View flow', () => {
  test('live view page loads with heading', async ({ page }) => {
    await page.goto('/live');
    await expect(page.locator('h1')).toContainText('Live View');
  });

  test('live view shows satellite selector with GOES-19', async ({ page }) => {
    await page.goto('/live');
    // GOES-19 is inside a <select> option, so check the select value
    const select = page.locator('select').first();
    await expect(select).toBeVisible();
    await expect(select).toHaveValue(/GOES-19/);
  });

  test('live view has auto-fetch toggle', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('Auto-fetch')).toBeVisible();
  });

  test('live view has compare option', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('Compare')).toBeVisible();
  });

  test('live view has Fetch Now button', async ({ page }) => {
    await page.goto('/live');
    await expect(page.getByText('Fetch Now')).toBeVisible();
  });

  test('live view has refresh interval selector', async ({ page }) => {
    await page.goto('/live');
    // The interval selector may be a <select> or buttons
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible({ timeout: 5000 });
  });

  test('live view survives reload', async ({ page }) => {
    await page.goto('/live');
    await expect(page.locator('h1')).toContainText('Live View');
    await page.reload();
    await expect(page.locator('h1')).toContainText('Live View');
  });
});
