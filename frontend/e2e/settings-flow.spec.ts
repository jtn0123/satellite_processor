import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
});

test.describe('Settings flow', () => {
  test('settings page renders with heading and sections', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toHaveText('Settings');
    // Should have form sections
    const labels = page.locator('label, legend, h2, h3');
    const count = await labels.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('settings page has save button that is clickable', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    const saveBtn = page.getByRole('button', { name: /save/i });
    await expect(saveBtn).toBeVisible({ timeout: 10000 });
    await expect(saveBtn).toBeEnabled();
  });

  test('settings page has codec/format select', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    const selects = page.locator('select');
    await expect(selects.first()).toBeVisible();
    // Should have multiple options
    const options = selects.first().locator('option');
    const count = await options.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('settings page has numeric input fields', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    const numberInputs = page.locator('input[type="number"]');
    const count = await numberInputs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('can modify a numeric setting value', async ({ page }) => {
    await page.goto('/settings', { waitUntil: 'networkidle' });
    await expect(page.locator('h1')).toBeVisible({ timeout: 10000 });
    const numberInput = page.locator('input[type="number"]').first();
    await expect(numberInput).toBeVisible();
    const originalValue = await numberInput.inputValue();
    await numberInput.fill('30');
    const newValue = await numberInput.inputValue();
    expect(newValue).toBe('30');
    // Restore
    await numberInput.fill(originalValue);
  });
});
