import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Animation page flow', () => {
  test('animate page loads with heading', async ({ page }) => {
    await page.goto('/animate');
    await expect(page.locator('h1')).toContainText('Animate');
  });

  test('animate page shows Quick Start presets', async ({ page }) => {
    await page.goto('/animate');
    await expect(page.getByText('Quick Start')).toBeVisible();
    await expect(page.getByText('Hurricane Watch')).toBeVisible();
  });

  test('animate page has Create Animation section', async ({ page }) => {
    await page.goto('/animate');
    await expect(page.getByText('Create Animation')).toBeVisible();
  });

  test('animate page has Animation Name field', async ({ page }) => {
    await page.goto('/animate');
    await expect(page.getByText('Animation Name')).toBeVisible();
  });

  test('animate page has satellite selector', async ({ page }) => {
    await page.goto('/animate');
    await expect(page.getByText('Satellite').first()).toBeVisible();
  });

  test('animate page survives reload', async ({ page }) => {
    await page.goto('/animate');
    await expect(page.locator('h1')).toContainText('Animate');
    await page.reload();
    await expect(page.locator('h1')).toContainText('Animate');
  });
});
