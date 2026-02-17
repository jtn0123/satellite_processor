import { Page, Route } from '@playwright/test';

/** Version used in mocks — must match localStorage to keep WhatsNewModal closed */
const MOCK_VERSION = '0.0.0-test';

const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * Default mock responses for all known API endpoints.
 * Returns an empty JSON object `{}` for any unrecognised `/api/**` route
 * instead of forwarding to the (non-existent) backend.
 */
export async function handleApiRoute(route: Route): Promise<void> {
  const url = route.request().url();

  // Image / thumbnail endpoints → 1×1 transparent PNG
  if (url.match(/\/api\/goes\/frames\/[^/]+\/(image|thumbnail)/))
    return void (await route.fulfill({ contentType: 'image/png', body: PIXEL }));

  // Health
  if (url.includes('/api/health/version'))
    return void (await route.fulfill({ json: { version: MOCK_VERSION, build: 'test' } }));
  if (url.includes('/api/health/changelog'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/health'))
    return void (await route.fulfill({ json: { status: 'ok' } }));

  // Stats / notifications / settings
  if (url.includes('/api/stats'))
    return void (await route.fulfill({ json: { total_images: 10, total_jobs: 5, active_jobs: 0, storage_used_mb: 256 } }));
  if (url.includes('/api/notifications'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/settings'))
    return void (await route.fulfill({ json: { video_fps: 24, max_frames_per_fetch: 200 } }));

  // GOES endpoints
  if (url.includes('/api/goes/frame-count'))
    return void (await route.fulfill({ json: { estimate: 0 } }));
  if (url.includes('/api/goes/products'))
    return void (await route.fulfill({
      json: {
        satellites: ['GOES-16', 'GOES-18'],
        sectors: [
          { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
          { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
        ],
        bands: [
          { id: 'C02', description: 'Red (0.64µm)' },
          { id: 'C13', description: 'IR (10.3µm)' },
        ],
      },
    }));
  if (url.includes('/api/goes/frames/stats'))
    return void (await route.fulfill({ json: { total_frames: 50, total_size_bytes: 2500000, by_satellite: {}, by_band: {} } }));
  if (url.includes('/api/goes/frames/preview-range'))
    return void (await route.fulfill({ json: { frames: [], total_count: 0, capture_interval_minutes: 10 } }));
  if (url.includes('/api/goes/frames'))
    return void (await route.fulfill({ json: { items: [], total: 0, page: 1, limit: 50 } }));
  if (url.includes('/api/goes/collections'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/goes/tags'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/goes/crop-presets'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/goes/animation-presets'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/goes/animations'))
    return void (await route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } }));
  if (url.includes('/api/goes/fetch-presets'))
    return void (await route.fulfill({ json: [] }));

  // Presets / jobs / images / system
  if (url.includes('/api/presets'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/jobs'))
    return void (await route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } }));
  if (url.includes('/api/images'))
    return void (await route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } }));
  if (url.includes('/api/system/status'))
    return void (await route.fulfill({
      json: { cpu_percent: 10, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
    }));

  // Catch-all: safe empty response (never forward to non-existent backend)
  return void (await route.fulfill({ json: {} }));
}

/**
 * Set up API mocking and dismiss the WhatsNew modal for a page.
 * Call in `test.beforeEach`.
 */
export async function setupMockApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('whatsNewLastSeen', '0.0.0-test');
  });
  await page.route('**/api/**', handleApiRoute);
}
