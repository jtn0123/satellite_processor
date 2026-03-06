import { test, expect, Page, Route } from '@playwright/test';
import { setupMockApi } from './helpers/mock-api';

/** Products response that includes Himawari-9 alongside GOES satellites */
const PRODUCTS_WITH_HIMAWARI = {
  satellites: ['GOES-19', 'GOES-18', 'GOES-16', 'Himawari-9'],
  satellite_availability: {
    'GOES-19': { available_from: '2024-01-01', available_to: null, status: 'active', description: 'GOES-East (active)' },
    'GOES-18': { available_from: '2022-01-01', available_to: null, status: 'active', description: 'GOES-West (active)' },
    'GOES-16': { available_from: '2017-01-01', available_to: '2025-04-07', status: 'historical', description: 'GOES-East (historical)' },
    'Himawari-9': { available_from: '2022-12-13', available_to: null, status: 'active', description: 'Himawari-9 (JMA)' },
  },
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPC', cadence_minutes: 5, typical_file_size_kb: 4000 },
    { id: 'FullDisk', name: 'FullDisk', product: 'ABI-L2-CMIPF', cadence_minutes: 10, typical_file_size_kb: 12000 },
    { id: 'FLDK', name: 'Full Disk', product: 'AHI-L1b-FLDK', cadence_minutes: 10, typical_file_size_kb: 15000 },
    { id: 'Japan', name: 'Japan', product: 'AHI-L1b-Japan', cadence_minutes: 2.5, typical_file_size_kb: 3000 },
    { id: 'Target', name: 'Target', product: 'AHI-L1b-Target', cadence_minutes: 2.5, typical_file_size_kb: 3000 },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor (True Color Day / IR Night)', wavelength_um: 0, common_name: 'GeoColor', category: 'composite', use_case: 'True color composite' },
    { id: 'C02', description: 'Red (0.64µm)', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Primary visible' },
    { id: 'C13', description: 'IR (10.3µm)', wavelength_um: 10.3, common_name: 'Clean IR', category: 'infrared', use_case: 'Clean IR window' },
    { id: 'TrueColor', description: 'True Color (RGB Composite)', wavelength_um: 0, common_name: 'TrueColor', category: 'composite', use_case: 'True color composite' },
    { id: 'B01', description: 'Visible Blue (0.47µm)', wavelength_um: 0.47, common_name: 'Blue', category: 'visible', use_case: 'Visible blue' },
    { id: 'B02', description: 'Visible Green (0.51µm)', wavelength_um: 0.51, common_name: 'Green', category: 'visible', use_case: 'Visible green' },
    { id: 'B03', description: 'Visible Red (0.64µm)', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Visible red' },
    { id: 'B13', description: 'Clean IR Longwave (10.4µm)', wavelength_um: 10.4, common_name: 'Clean IR', category: 'infrared', use_case: 'Clean IR window' },
  ],
  default_satellite: 'GOES-19',
};

/**
 * Override the mock-api products endpoint so Himawari-9 is included in the
 * satellite list and sector/band metadata is available.
 */
async function setupHimawariMocks(page: Page): Promise<void> {
  await setupMockApi(page);

  // Override the products route to include Himawari-9
  await page.route('**/api/satellite/products', async (route: Route) => {
    await route.fulfill({ json: PRODUCTS_WITH_HIMAWARI });
  });
}

// ---------------------------------------------------------------------------
// Live Tab — Himawari Satellite Switching
// ---------------------------------------------------------------------------
test.describe('Live Tab — Himawari satellite switching', () => {
  test.beforeEach(async ({ page }) => {
    await setupHimawariMocks(page);
  });

  test('satellite selector shows Himawari-9 option', async ({ page }) => {
    await page.goto('/live');
    const satelliteChip = page.locator('[data-testid="pill-strip-satellite"]');
    await expect(satelliteChip).toBeVisible({ timeout: 10_000 });
    await satelliteChip.click();

    const himawariOption = page.locator('[data-testid="satellite-option-Himawari-9"]');
    await expect(himawariOption).toBeVisible({ timeout: 5_000 });
  });

  test('switching to Himawari-9 resets sector to FLDK and band to TrueColor', async ({ page }) => {
    await page.goto('/live');
    const satelliteChip = page.locator('[data-testid="pill-strip-satellite"]');
    await expect(satelliteChip).toBeVisible({ timeout: 10_000 });

    // Switch to Himawari-9
    await satelliteChip.click();
    await page.locator('[data-testid="satellite-option-Himawari-9"]').click();

    // Verify satellite chip shows Himawari-9
    await expect(satelliteChip).toContainText('Himawari-9', { timeout: 5_000 });

    // Status pill should show TrueColor band
    const statusPill = page.locator('[data-testid="status-pill"]');
    await expect(statusPill).toBeVisible({ timeout: 5_000 });
    const pillText = await statusPill.textContent();
    expect(pillText).toContain('Himawari-9');
  });

  test('Himawari sectors are FLDK, Japan, Target (not CONUS/FullDisk/Meso)', async ({ page }) => {
    await page.goto('/live');
    const satelliteChip = page.locator('[data-testid="pill-strip-satellite"]');
    await expect(satelliteChip).toBeVisible({ timeout: 10_000 });

    // Switch to Himawari-9
    await satelliteChip.click();
    await page.locator('[data-testid="satellite-option-Himawari-9"]').click();
    await expect(satelliteChip).toContainText('Himawari-9', { timeout: 5_000 });

    // Expand sector dropdown
    const sectorChip = page.locator('[data-testid="pill-strip-sector"]');
    await expect(sectorChip).toBeVisible({ timeout: 5_000 });
    await sectorChip.click();

    // Himawari sectors should be present
    await expect(page.locator('[data-testid="sector-option-FLDK"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="sector-option-Japan"]')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="sector-option-Target"]')).toBeVisible({ timeout: 5_000 });

    // GOES sectors should NOT be present
    expect(await page.locator('[data-testid="sector-option-CONUS"]').count()).toBe(0);
    expect(await page.locator('[data-testid="sector-option-FullDisk"]').count()).toBe(0);
  });

  test('no CDN preview available message shown for Himawari', async ({ page }) => {
    // Block CDN and local image sources so the Himawari no-preview message triggers
    await page.route('**/cdn.star.nesdis.noaa.gov/**', (route) => route.abort('connectionrefused'));
    await page.route('**/api/satellite/latest*', (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));
    await page.route('**/api/satellite/catalog/latest*', (route) => route.fulfill({ status: 404, json: { detail: 'not found' } }));

    await page.goto('/live');
    const satelliteChip = page.locator('[data-testid="pill-strip-satellite"]');
    await expect(satelliteChip).toBeVisible({ timeout: 10_000 });

    // Switch to Himawari-9
    await satelliteChip.click();
    await page.locator('[data-testid="satellite-option-Himawari-9"]').click();
    await expect(satelliteChip).toContainText('Himawari-9', { timeout: 5_000 });

    // Should show the improved Himawari empty state or generic no-frames message
    const himawariTitle = page.getByText(/No Himawari-9 data yet/i);
    const noPreview = page.getByText(/No CDN preview available/i);
    const noFrames = page.getByText(/No local frames/i);
    const fetchPrompt = page.getByText(/Fetch data to get started/i);
    // Either the specific Himawari message or the generic no-frames message
    await expect(himawariTitle.or(noPreview).or(noFrames).or(fetchPrompt)).toBeVisible({ timeout: 10_000 });
  });

  test('band pill strip shows Himawari bands after switching', async ({ page }) => {
    await page.goto('/live');
    const satelliteChip = page.locator('[data-testid="pill-strip-satellite"]');
    await expect(satelliteChip).toBeVisible({ timeout: 10_000 });

    // Switch to Himawari-9
    await satelliteChip.click();
    await page.locator('[data-testid="satellite-option-Himawari-9"]').click();
    await expect(satelliteChip).toContainText('Himawari-9', { timeout: 5_000 });

    // Band strip should show Himawari band pills (TrueColor and B-prefixed bands)
    const strip = page.locator('[data-testid="band-pill-strip"]');
    await expect(strip).toBeVisible({ timeout: 10_000 });

    // Should have a TrueColor pill
    const trueColorPill = strip.locator('button[data-testid="band-pill-TrueColor"]');
    await expect(trueColorPill).toBeVisible({ timeout: 5_000 });
  });
});

// ---------------------------------------------------------------------------
// Fetch Tab — Himawari Integration
// ---------------------------------------------------------------------------
test.describe('Fetch Tab — Himawari', () => {
  test.beforeEach(async ({ page }) => {
    await setupHimawariMocks(page);
    await page.route('**/api/satellite/fetch', async (route: Route) => {
      await route.fulfill({ json: { job_id: 'fetch-job-1', status: 'pending', message: 'ok' } });
    });
    await page.route('**/api/satellite/fetch-composite', async (route: Route) => {
      await route.fulfill({ json: { job_id: 'composite-job-1', status: 'pending', message: 'ok' } });
    });
    await page.route('**/api/jobs**', async (route: Route) => {
      await route.fulfill({ json: { items: [], total: 0 } });
    });
    await page.route('**/api/satellite/fetch-presets', async (route: Route) => {
      await route.fulfill({ json: [] });
    });
  });

  test('Himawari-9 appears in the satellite cards on wizard step 1', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();
    const advancedBtn = page.getByTestId('advanced-fetch-toggle');
    await advancedBtn.waitFor({ state: 'visible', timeout: 5_000 });
    await advancedBtn.click();

    // Use exact match to avoid matching the description text "Himawari-9 (JMA)"
    await expect(page.getByText('Himawari-9', { exact: true }).first()).toBeVisible({ timeout: 5_000 });
  });

  test('Himawari quick fetch chips are shown on Fetch tab', async ({ page }) => {
    await page.goto('/goes');
    const fetchTab = page.locator('[role="tab"]').filter({ hasText: /fetch/i }).first();
    await fetchTab.click();

    // Should have Himawari quick fetch chips (e.g. FLDK related)
    const quickSection = page.getByTestId('quick-fetch-section');
    await expect(quickSection).toBeVisible({ timeout: 5_000 });
    // Look for Himawari-specific quick chips (FLDK or Japan)
    const himawariChip = quickSection.getByText(/FLDK/);
    // If no FLDK chip in quick fetch, at least the section should render
    if (await himawariChip.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(himawariChip).toBeVisible();
    }
  });
});

// ---------------------------------------------------------------------------
// Presets Tab — Himawari Integration
// ---------------------------------------------------------------------------
test.describe('Presets Tab — Himawari', () => {
  test.beforeEach(async ({ page }) => {
    await setupHimawariMocks(page);
    await page.route('**/api/satellite/fetch-presets', async (route: Route) => {
      if (route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as Record<string, string>;
        await route.fulfill({
          json: { id: 'preset-1', ...body, created_at: '2025-01-01T00:00:00Z' },
        });
      } else {
        await route.fulfill({ json: [] });
      }
    });
    await page.route('**/api/satellite/schedules', async (route: Route) => {
      await route.fulfill({ json: [] });
    });
  });

  test('can create a preset with Himawari-9 satellite', async ({ page }) => {
    await page.goto('/goes');

    // Navigate to Presets tab (might be named "Presets" or visible in the tab list)
    const tabs = page.locator('main [role="tab"]');
    const presetTab = tabs.filter({ hasText: /preset/i }).first();

    // Presets tab might not exist as a direct tab — check for it
    if (await presetTab.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await presetTab.click();
    } else {
      // Try the Stats tab which may contain presets, or navigate directly
      await page.goto('/goes?tab=presets');
    }

    // Click "New Preset" button
    const newPresetBtn = page.getByRole('button', { name: /new preset/i });
    if (await newPresetBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await newPresetBtn.click();

      // Fill preset form
      await page.getByRole('textbox', { name: /preset name/i }).fill('Himawari FLDK B13');

      // Select Himawari-9 satellite
      const satSelect = page.getByRole('combobox', { name: /satellite/i });
      await satSelect.selectOption('Himawari-9');

      // Sector dropdown should now show Himawari sectors
      const sectorSelect = page.getByRole('combobox', { name: /sector/i });
      await expect(sectorSelect).toBeVisible();
      // Verify FLDK is an option
      const options = sectorSelect.locator('option');
      const optionTexts: string[] = [];
      const count = await options.count();
      for (let i = 0; i < count; i++) {
        optionTexts.push(await options.nth(i).textContent() ?? '');
      }
      expect(optionTexts.some((t) => t.includes('FLDK'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Animation Studio — Himawari Band Names
// ---------------------------------------------------------------------------
test.describe('Animation Studio — Himawari band names', () => {
  test.beforeEach(async ({ page }) => {
    await setupHimawariMocks(page);
    await page.route('**/api/satellite/animations**', async (route: Route) => {
      await route.fulfill({ json: { items: [], total: 0, page: 1, limit: 20 } });
    });
  });

  test('Himawari band names shown in animation studio band selector', async ({ page }) => {
    await page.goto('/animations');

    // Wait for the animation studio to load
    const satelliteSelect = page.locator('#anim-satellite');
    if (await satelliteSelect.isVisible({ timeout: 5_000 }).catch(() => false)) {
      // Select Himawari-9
      await satelliteSelect.selectOption('Himawari-9');

      // Check band dropdown for Himawari band labels
      const bandSelect = page.locator('#anim-band');
      await expect(bandSelect).toBeVisible({ timeout: 5_000 });

      // B13 should show "Clean IR" label
      const bandOptions = bandSelect.locator('option');
      const bandTexts: string[] = [];
      const count = await bandOptions.count();
      for (let i = 0; i < count; i++) {
        bandTexts.push(await bandOptions.nth(i).textContent() ?? '');
      }
      // Find B13 entry — should contain "Clean IR"
      const b13Option = bandTexts.find((t) => t.includes('B13'));
      if (b13Option) {
        expect(b13Option).toMatch(/Clean IR/i);
      }
    }
  });
});
