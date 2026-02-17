import { test, expect } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test.beforeEach(async ({ page }) => {
  await setupMockApi(page);
  // Override settings with additional fields needed by settings page
  await page.route('**/api/settings**', async (route) => {
    await route.fulfill({
      json: {
        default_false_color: 'vegetation',
        timestamp_enabled: true,
        timestamp_position: 'bottom-left',
        video_fps: 24,
        video_codec: 'h264',
        video_quality: 23,
        max_frames_per_fetch: 200,
      },
    });
  });
});

test('form fields render', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('h1:has-text("Settings")')).toBeVisible();
  await expect(page.locator('text=Default False Color')).toBeVisible();
  await expect(page.locator('text=Video Codec')).toBeVisible();
});

test('save button exists', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.locator('text=Save')).toBeVisible();
});

test('codec dropdown has options', async ({ page }) => {
  await page.goto('/settings');
  // Multiple selects now: false_color, timestamp_position, video_codec
  const selects = page.locator('select');
  await expect(selects).toHaveCount(3);
});
