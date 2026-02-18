import { test } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

test('debug page content', async ({ page }) => {
  page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  await setupMockApi(page);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(8000);
  console.log('Root innerHTML:', await page.locator('#root').innerHTML());
});
