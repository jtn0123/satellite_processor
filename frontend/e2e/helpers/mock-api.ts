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
  if (url.includes('/api/goes/catalog/latest'))
    return void (await route.fulfill({ json: { scan_time: '2025-01-01T12:00:00Z', size: 12345, key: 'test.nc', satellite: 'GOES-19', sector: 'CONUS', band: 'C02' } }));
  if (url.includes('/api/goes/catalog'))
    return void (await route.fulfill({ json: [] }));
  if (url.includes('/api/goes/fetch-composite'))
    return void (await route.fulfill({ json: { job_id: 'composite-job-1', status: 'pending', message: 'ok' } }));
  if (url.includes('/api/goes/frame-count'))
    return void (await route.fulfill({ json: { estimate: 0 } }));
  if (url.includes('/api/goes/products'))
    return void (await route.fulfill({
      json: {
        satellites: ['GOES-19', 'GOES-18', 'GOES-16'],
        satellite_availability: {
          'GOES-19': { available_from: '2024-01-01', available_to: null, status: 'active', description: 'GOES-East (active)' },
          'GOES-18': { available_from: '2022-01-01', available_to: null, status: 'active', description: 'GOES-West (active)' },
          'GOES-16': { available_from: '2017-01-01', available_to: '2025-04-07', status: 'historical', description: 'GOES-East (historical)' },
        },
        sectors: [
          { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPC', cadence_minutes: 5, typical_file_size_kb: 4000 },
          { id: 'FullDisk', name: 'FullDisk', product: 'ABI-L2-CMIPF', cadence_minutes: 10, typical_file_size_kb: 12000 },
        ],
        bands: [
          { id: 'C02', description: 'Red (0.64µm)', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Primary visible' },
          { id: 'C13', description: 'IR (10.3µm)', wavelength_um: 10.3, common_name: 'Clean IR', category: 'infrared', use_case: 'Clean IR window' },
        ],
        default_satellite: 'GOES-19',
      },
    }));
  if (url.includes('/api/goes/dashboard-stats'))
    return void (await route.fulfill({ json: { total_frames: 50, frames_by_satellite: {}, last_fetch_time: null, active_schedules: 0, recent_jobs: [], storage_by_satellite: {}, storage_by_band: {} } }));
  if (url.includes('/api/goes/stats'))
    return void (await route.fulfill({ json: { by_satellite: {}, by_band: {}, total_size: 0, total_frames: 0 } }));
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

  // Download endpoint (thumbnails, images) → 1×1 transparent PNG
  if (url.includes('/api/download'))
    return void (await route.fulfill({ contentType: 'image/png', body: PIXEL }));

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
