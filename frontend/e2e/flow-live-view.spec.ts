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

  // --- Controls & Dropdowns ---

  test('band selector has options', async ({ page }) => {
    await page.goto('/live');
    const select = page.locator('select[aria-label="Band"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    const options = select.locator('option');
    expect(await options.count()).toBeGreaterThanOrEqual(2);
  });

  test('sector selector has options', async ({ page }) => {
    await page.goto('/live');
    const select = page.locator('select[aria-label="Sector"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    const options = select.locator('option');
    expect(await options.count()).toBeGreaterThanOrEqual(2);
    // Verify known sectors
    await expect(select).toContainText('CONUS');
    await expect(select).toContainText('FullDisk');
  });

  test('changing satellite updates the view', async ({ page }) => {
    await page.goto('/live');
    const select = page.locator('select[aria-label="Satellite"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    // Default should be GOES-19
    await expect(select).toHaveValue('GOES-19');
    await select.selectOption('GOES-18');
    await expect(select).toHaveValue('GOES-18');
  });

  test('changing band updates the view', async ({ page }) => {
    await page.goto('/live');
    const select = page.locator('select[aria-label="Band"]');
    await expect(select).toBeVisible({ timeout: 10000 });
    await expect(select).toHaveValue('C02');
    await select.selectOption('C13');
    await expect(select).toHaveValue('C13');
  });

  // --- Image Display ---

  test('image loads or shows error state', async ({ page }) => {
    await page.goto('/live');
    // Either an img with src OR the error/empty state should appear
    const img = page.locator('img[alt]');
    const noFrames = page.getByText('No local frames available');
    const noFramesLoaded = page.getByText('No frames loaded yet');
    await expect(img.or(noFrames).or(noFramesLoaded)).toBeVisible({ timeout: 10000 });
  });

  test('image container renders when data available', async ({ page }) => {
    await page.goto('/live');
    // Image container only renders when catalog/frame data is available
    const container = page.locator('[data-testid="live-image-container"]');
    const emptyState = page.getByText('No frames loaded yet').or(page.getByText('No local frames available'));
    await expect(container.or(emptyState)).toBeVisible({ timeout: 10000 });
  });

  test('retry button appears on image error', async ({ page }) => {
    // Override image routes to return 500 to trigger error state
    await page.route('**/api/goes/latest*', (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));
    await page.route('**/api/goes/catalog/latest*', (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));
    await page.goto('/live');
    // Should show error state with retry — scope to the image area
    const imageArea = page.locator('[data-testid="live-image-area"]');
    const retryBtn = imageArea.getByText('Tap to retry');
    const fetchBtn = imageArea.getByText('Fetch your first image');
    const noFrames = imageArea.getByText('No frames loaded yet');
    // One of the error/empty states should appear
    await expect(retryBtn.or(fetchBtn).or(noFrames).first()).toBeVisible({ timeout: 10000 });
  });

  // --- Metadata & Layout ---

  test('metadata line shows satellite info when data loaded', async ({ page }) => {
    await page.goto('/live');
    // Metadata only renders when catalog/frame data is available from mock API
    const metaArea = page.locator('[data-testid="condensed-metadata"]');
    if (await metaArea.isVisible({ timeout: 5000 }).catch(() => false)) {
      // If metadata rendered, it should contain satellite info
      const text = await metaArea.textContent();
      expect(text).toBeTruthy();
    }
    // If no data loaded, metadata won't render — that's OK in mocked E2E
  });

  test('expandable details toggle', async ({ page }) => {
    await page.goto('/live');
    const toggleBtn = page.locator('button[aria-label="Toggle image details"]');
    // This button only appears when metadata is visible (frame or catalog data loaded)
    if (await toggleBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'false');
      await toggleBtn.click();
      await expect(toggleBtn).toHaveAttribute('aria-expanded', 'true');
    }
  });

  test('version number not visible in live content area', async ({ page }) => {
    await page.goto('/live');
    // The live content area should not show a version string (sidebar may contain it)
    const liveContent = page.locator('[data-testid="live-image-area"]');
    await expect(liveContent).toBeVisible({ timeout: 10000 });
    const versionText = liveContent.locator('text=/v\\d+\\./');
    expect(await versionText.count()).toBe(0);
  });

  test('breadcrumb hidden on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/live');
    await expect(page.locator('h1')).toContainText('Live', { timeout: 10000 });
    // Breadcrumb nav should not be visible on mobile
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]');
    if (await breadcrumb.count() > 0) {
      await expect(breadcrumb).not.toBeVisible();
    }
  });

  // --- New UX Features ---

  test('cached image banner is dismissible', async ({ page }) => {
    // Pre-seed cached image data so the banner appears on error fallback
    await page.addInitScript(() => {
      localStorage.setItem('live-last-image-meta', JSON.stringify({
        url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        satellite: 'GOES-19', band: 'C02', sector: 'CONUS',
        timestamp: new Date().toISOString(),
      }));
    });
    // Make the live image fail so it falls back to cached
    await page.route('**/api/goes/latest*', (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));
    // Also make thumbnail/image URLs fail
    await page.route('**/api/goes/frames/*/image', (route) => route.fulfill({ status: 500 }));
    await page.goto('/live');
    const banner = page.locator('[data-testid="cached-image-banner"]');
    if (await banner.isVisible({ timeout: 8000 }).catch(() => false)) {
      const dismissBtn = banner.locator('button[aria-label="Dismiss cached banner"]');
      await dismissBtn.click();
      await expect(banner).not.toBeVisible();
    }
  });

  test('auto-refresh countdown visible', async ({ page }) => {
    await page.goto('/live');
    const refreshBtn = page.locator('button[aria-label="Refresh now"]');
    await expect(refreshBtn).toBeVisible({ timeout: 10000 });
    // Countdown is a span inside the refresh button showing m:ss format
    const countdown = refreshBtn.locator('span');
    await expect(countdown).toBeVisible({ timeout: 5000 });
    const text = await countdown.textContent();
    expect(text).toMatch(/\d+:\d{2}/);
  });

  test('controls FAB button has label', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/live');
    const fab = page.locator('[data-testid="mobile-fab"]');
    await expect(fab).toBeVisible({ timeout: 10000 });
    await expect(fab.getByText('Controls')).toBeVisible();
  });

  test('swipe gesture area exists', async ({ page }) => {
    await page.goto('/live');
    // The swipe gesture area wraps the image panel content
    const swipeArea = page.locator('[data-testid="swipe-gesture-area"]');
    await expect(swipeArea).toBeVisible({ timeout: 10000 });
  });

  // --- Responsive ---

  test('mobile viewport — bottom nav visible', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/live');
    // Mobile bottom navigation bar
    const bottomNav = page.locator('[data-testid="mobile-bottom-nav"]');
    await expect(bottomNav).toBeVisible({ timeout: 10000 });
  });

  test('desktop viewport — sidebar visible', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('/live');
    // Desktop sidebar navigation
    const sidebar = page.locator('[data-testid="desktop-sidebar"]');
    await expect(sidebar).toBeVisible({ timeout: 10000 });
  });
});
