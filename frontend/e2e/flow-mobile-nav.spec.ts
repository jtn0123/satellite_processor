import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Mobile navigation', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('mobile shows bottom nav with Live tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Live').last()).toBeVisible();
  });

  test('mobile shows bottom nav with Browse tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Browse').last()).toBeVisible();
  });

  test('mobile shows bottom nav with Animate tab', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Animate').last()).toBeVisible();
  });

  test('mobile bottom nav navigates to live', async ({ page }) => {
    await page.goto('/');
    await page.getByText('Live').last().click();
    await expect(page).toHaveURL(/live/);
  });

  test('mobile pages do not have horizontal overflow', async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(1000);
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth);
    const viewportWidth = await page.evaluate(() => window.innerWidth);
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 5);
  });
});
