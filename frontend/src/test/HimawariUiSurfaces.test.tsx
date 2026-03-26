import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithRoute } from './testUtils';

// Mock api client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import api from '../api/client';
import { MONITOR_PRESETS } from '../components/GoesData/monitorPresets';
import {
  HIMAWARI_BAND_INFO,
  getBandInfoForSatellite,
  getBandLabel,
} from '../constants/bands';
import {
  getSectorsForSatellite,
  getBandsForSatellite,
  getCompositeBand,
  isCompositeBand,
  getDisabledBands,
} from '../components/GoesData/liveTabUtils';
import {
  isHimawariSatellite,
  getDefaultBand,
  getDefaultSector,
} from '../utils/sectorHelpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

const renderWithProviders = renderWithRoute;

const HIMAWARI_PRODUCTS = {
  satellites: ['GOES-16', 'GOES-18', 'GOES-19', 'Himawari-9'],
  satellite_availability: {
    'GOES-16': { available_from: '2017-12-18', available_to: null, status: 'active', description: 'GOES-East' },
    'GOES-18': { available_from: '2022-01-01', available_to: null, status: 'active', description: 'GOES-West' },
    'GOES-19': { available_from: '2024-06-01', available_to: null, status: 'active', description: 'GOES-East' },
    'Himawari-9': { available_from: '2022-12-13', available_to: null, status: 'active', description: 'East Asia / W. Pacific' },
  },
  sectors: [
    { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPC' },
    { id: 'FLDK', name: 'Full Disk', product: 'AHI-L1b-FLDK' },
    { id: 'Japan', name: 'Japan', product: 'AHI-L1b-Japan' },
    { id: 'Target', name: 'Target', product: 'AHI-L1b-Target' },
  ],
  bands: [
    { id: 'C02', description: 'Red (0.64µm)' },
    { id: 'B13', description: 'Clean IR (10.4µm)' },
  ],
  default_satellite: 'GOES-19',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/satellite/products') return Promise.resolve({ data: HIMAWARI_PRODUCTS });
    if (url === '/satellite/frames') return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
    if (url === '/satellite/collections') return Promise.resolve({ data: [] });
    if (url === '/satellite/fetch-presets') return Promise.resolve({ data: [] });
    if (url === '/satellite/schedules') return Promise.resolve({ data: [] });
    if (url === '/satellite/composite-recipes') return Promise.resolve({ data: [] });
    if (url === '/satellite/composites') return Promise.resolve({ data: { items: [], total: 0 } });
    if (url === '/satellite/animations') return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 20 } });
    if (url === '/satellite/crop-presets') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

/* ── constants/bands.ts ──────────────────────────────── */

describe('Himawari Band Info', () => {
  it('has all 16 Himawari bands', () => {
    const bandIds = Object.keys(HIMAWARI_BAND_INFO);
    expect(bandIds).toHaveLength(16);
    expect(bandIds[0]).toBe('B01');
    expect(bandIds[15]).toBe('B16');
  });

  it('B02 is Green (different from GOES C02 Red)', () => {
    expect(HIMAWARI_BAND_INFO.B02.name).toBe('Green');
    expect(HIMAWARI_BAND_INFO.B02.category).toBe('Visible');
  });

  it('getBandInfoForSatellite returns correct map', () => {
    const goesInfo = getBandInfoForSatellite('GOES-19');
    expect(goesInfo.C02).toBeDefined();
    expect(goesInfo.B01).toBeUndefined();

    const himInfo = getBandInfoForSatellite('Himawari-9');
    expect(himInfo.B01).toBeDefined();
    expect(himInfo.C01).toBeUndefined();
  });

  it('getBandLabel works for Himawari bands', () => {
    expect(getBandLabel('B13', 'Himawari-9')).toContain('Clean IR');
    expect(getBandLabel('B02', 'Himawari-9')).toContain('Green');
  });

  it('getBandLabel works for GOES bands', () => {
    expect(getBandLabel('C02')).toContain('Red');
    expect(getBandLabel('C13')).toContain('Clean IR');
  });
});

/* ── liveTabUtils.ts ─────────────────────────────────── */

describe('Satellite-aware sectors and bands', () => {
  it('getSectorsForSatellite returns Himawari sectors', () => {
    const sectors = getSectorsForSatellite('Himawari-9');
    expect(sectors.map(s => s.id)).toEqual(['FLDK', 'Japan', 'Target']);
  });

  it('getSectorsForSatellite returns GOES sectors', () => {
    const sectors = getSectorsForSatellite('GOES-19');
    expect(sectors.map(s => s.id)).toContain('FullDisk');
    expect(sectors.map(s => s.id)).toContain('CONUS');
  });

  it('getBandsForSatellite returns Himawari bands with TrueColor', () => {
    const bands = getBandsForSatellite('Himawari-9');
    expect(bands[0].id).toBe('TrueColor');
    expect(bands).toHaveLength(17); // TrueColor + B01-B16
  });

  it('getBandsForSatellite returns GOES bands with GEOCOLOR', () => {
    const bands = getBandsForSatellite('GOES-19');
    expect(bands[0].id).toBe('GEOCOLOR');
    expect(bands).toHaveLength(17); // GEOCOLOR + C01-C16
  });

  it('getCompositeBand returns correct composite for each satellite', () => {
    expect(getCompositeBand('GOES-19')).toBe('GEOCOLOR');
    expect(getCompositeBand('Himawari-9')).toBe('TrueColor');
  });

  it('isCompositeBand identifies composite bands correctly', () => {
    expect(isCompositeBand('GEOCOLOR', 'GOES-19')).toBe(true);
    expect(isCompositeBand('TrueColor', 'Himawari-9')).toBe(true);
    expect(isCompositeBand('GEOCOLOR', 'Himawari-9')).toBe(false);
    expect(isCompositeBand('TrueColor', 'GOES-19')).toBe(false);
    expect(isCompositeBand('C02', 'GOES-19')).toBe(false);
    expect(isCompositeBand('B13', 'Himawari-9')).toBe(false);
  });

  it('getDisabledBands works for Himawari sectors', () => {
    // TrueColor is available for all Himawari sectors
    expect(getDisabledBands('Himawari-9', 'FLDK')).toEqual([]);
    expect(getDisabledBands('Himawari-9', 'Japan')).toEqual([]);
    expect(getDisabledBands('Himawari-9', 'Target')).toEqual([]);
  });
});

/* ── sectorHelpers.ts ────────────────────────────────── */

describe('Satellite helper functions', () => {
  it('isHimawariSatellite identifies Himawari variants', () => {
    expect(isHimawariSatellite('Himawari-9')).toBe(true);
    expect(isHimawariSatellite('Himawari-8')).toBe(true);
    expect(isHimawariSatellite('himawari-9')).toBe(true);
    expect(isHimawariSatellite('H9')).toBe(true);
    expect(isHimawariSatellite('GOES-19')).toBe(false);
  });

  it('getDefaultBand returns TrueColor for Himawari', () => {
    expect(getDefaultBand('Himawari-9')).toBe('TrueColor');
    expect(getDefaultBand('GOES-19')).toBe('GEOCOLOR');
  });

  it('getDefaultSector returns FLDK for Himawari', () => {
    expect(getDefaultSector('Himawari-9')).toBe('FLDK');
    expect(getDefaultSector('GOES-19')).toBe('CONUS');
  });
});

/* ── monitorPresets.ts ───────────────────────────────── */

describe('Monitor Presets include Himawari', () => {
  it('has GOES and Himawari presets', () => {
    const goesPresets = MONITOR_PRESETS.filter(p => !p.satellite || p.satellite?.startsWith('GOES'));
    const himPresets = MONITOR_PRESETS.filter(p => p.satellite === 'Himawari-9');
    expect(goesPresets.length).toBeGreaterThanOrEqual(3);
    expect(himPresets.length).toBeGreaterThanOrEqual(3);
  });

  it('Himawari presets use correct sectors', () => {
    const himPresets = MONITOR_PRESETS.filter(p => p.satellite === 'Himawari-9');
    const sectors = himPresets.map(p => p.sector);
    expect(sectors).toContain('Japan');
    expect(sectors).toContain('FLDK');
    expect(sectors).toContain('Target');
  });

  it('Himawari Japan preset uses TrueColor', () => {
    const japanPreset = MONITOR_PRESETS.find(p => p.satellite === 'Himawari-9' && p.sector === 'Japan');
    expect(japanPreset).toBeDefined();
    expect(japanPreset!.band).toBe('TrueColor');
  });
});

/* ── FetchTab ────────────────────────────────────────── */

describe('FetchTab Himawari support', () => {
  it('renders Himawari-9 in satellite selection', async () => {
    const FetchTab = (await import('../components/GoesData/FetchTab/FetchTab')).default;
    renderWithProviders(<FetchTab />);

    // Wait for products to load, open advanced mode
    await waitFor(() => {
      expect(screen.getByTestId('advanced-fetch-toggle')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('advanced-fetch-toggle'));

    await waitFor(() => {
      expect(screen.getByText('Himawari-9')).toBeInTheDocument();
    });
  });

  it('shows Himawari quick fetch chips', async () => {
    const FetchTab = (await import('../components/GoesData/FetchTab/FetchTab')).default;
    renderWithProviders(<FetchTab />);

    await waitFor(() => {
      expect(screen.getByTestId('quick-fetch-section')).toBeInTheDocument();
    });

    // Check for Himawari quick fetch chips
    expect(screen.getByText(/FLDK B13 Last Hour/)).toBeInTheDocument();
    expect(screen.getByText(/Japan TrueColor/)).toBeInTheDocument();
  });

  it('routes TrueColor quick fetch to composite endpoint', async () => {
    const FetchTab = (await import('../components/GoesData/FetchTab/FetchTab')).default;
    renderWithProviders(<FetchTab />);

    await waitFor(() => {
      expect(screen.getByTestId('quick-fetch-section')).toBeInTheDocument();
    });

    // Click the Japan TrueColor chip
    const japanBtn = screen.getByText(/Japan TrueColor/);
    fireEvent.click(japanBtn);

    await waitFor(() => {
      // Should use fetch-composite endpoint for TrueColor
      expect(mockedApi.post).toHaveBeenCalledWith('/satellite/fetch-composite', expect.objectContaining({
        satellite: 'Himawari-9',
        sector: 'Japan',
        recipe: 'true_color',
      }));
    });
  });

  it('routes single band Himawari quick fetch to standard endpoint', async () => {
    const FetchTab = (await import('../components/GoesData/FetchTab/FetchTab')).default;
    renderWithProviders(<FetchTab />);

    await waitFor(() => {
      expect(screen.getByTestId('quick-fetch-section')).toBeInTheDocument();
    });

    const fldkBtn = screen.getByText(/FLDK B13 Last Hour/);
    fireEvent.click(fldkBtn);

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/satellite/fetch', expect.objectContaining({
        satellite: 'Himawari-9',
        sector: 'FLDK',
        band: 'B13',
      }));
    });
  });
});

/* ── PresetsTab ──────────────────────────────────────── */

describe('PresetsTab Himawari support', () => {
  it('renders satellite-aware sector/band dropdowns', async () => {
    const PresetsTab = (await import('../components/GoesData/PresetsTab')).default;
    renderWithProviders(<PresetsTab />);

    await waitFor(() => {
      expect(screen.getByText('Fetch Presets')).toBeInTheDocument();
    });

    // Click "New Preset" 
    fireEvent.click(screen.getByText('New Preset'));

    // Should see satellite selector with Himawari-9 option
    const selects = screen.getAllByRole('combobox');
    const satSelect = selects.find(s => s.getAttribute('aria-label') === 'Satellite');
    expect(satSelect).toBeDefined();

    // Check Himawari-9 is an option
    const options = Array.from(satSelect!.querySelectorAll('option'));
    const himawariOption = options.find(o => o.value === 'Himawari-9');
    expect(himawariOption).toBeDefined();
  });

  it('switches sectors/bands when satellite changes to Himawari', async () => {
    const PresetsTab = (await import('../components/GoesData/PresetsTab')).default;
    renderWithProviders(<PresetsTab />);

    await waitFor(() => {
      expect(screen.getByText('Fetch Presets')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('New Preset'));

    const selects = screen.getAllByRole('combobox');
    const satSelect = selects.find(s => s.getAttribute('aria-label') === 'Satellite');

    // Switch to Himawari-9
    fireEvent.change(satSelect!, { target: { value: 'Himawari-9' } });

    // Sector dropdown should now show Himawari sectors
    const sectorSelect = selects.find(s => s.getAttribute('aria-label') === 'Sector');
    await waitFor(() => {
      const sectorOptions = Array.from(sectorSelect!.querySelectorAll('option'));
      const sectorIds = sectorOptions.map(o => o.value);
      expect(sectorIds).toContain('FLDK');
      expect(sectorIds).toContain('Japan');
      expect(sectorIds).toContain('Target');
    });

    // Band dropdown should show Himawari bands
    const bandSelect = selects.find(s => s.getAttribute('aria-label') === 'Band');
    await waitFor(() => {
      const bandOptions = Array.from(bandSelect!.querySelectorAll('option'));
      const bandIds = bandOptions.map(o => o.value);
      expect(bandIds).toContain('B01');
      expect(bandIds).toContain('B13');
      expect(bandIds).toContain('TrueColor');
    });
  });
});

/* ── AnimationStudioTab ──────────────────────────────── */

describe('AnimationStudioTab Himawari support', () => {
  it('shows Himawari-9 in satellite dropdown', async () => {
    const AnimationStudioTab = (await import('../components/GoesData/AnimationStudioTab/AnimationStudioTab')).default;
    renderWithProviders(<AnimationStudioTab />);

    await waitFor(() => {
      const satSelect = screen.getByLabelText('Satellite');
      const options = Array.from(satSelect.querySelectorAll('option'));
      expect(options.map(o => o.textContent)).toContain('Himawari-9');
    });
  });

  it('shows satellite-aware bands when Himawari selected', async () => {
    const AnimationStudioTab = (await import('../components/GoesData/AnimationStudioTab/AnimationStudioTab')).default;
    renderWithProviders(<AnimationStudioTab />);

    // Wait for products to load — satellite options should appear
    await waitFor(() => {
      const satSelect = document.getElementById('anim-satellite') as HTMLSelectElement;
      const opts = Array.from(satSelect.querySelectorAll('option'));
      expect(opts.length).toBeGreaterThan(1);
    });

    // Select Himawari-9
    fireEvent.change(document.getElementById('anim-satellite')!, { target: { value: 'Himawari-9' } });

    // Allow re-render
    await new Promise(r => setTimeout(r, 50));

    // Band dropdown should show Himawari bands
    const bandSelect = document.getElementById('anim-band') as HTMLSelectElement;
    const bandOptions = Array.from(bandSelect.querySelectorAll('option'));
    const bandValues = bandOptions.map(o => o.getAttribute('value') ?? '');
    expect(bandValues).toContain('TrueColor');
    expect(bandValues).toContain('B01');
    expect(bandValues).toContain('B13');
    expect(bandValues).toContain('B16');

    // Sector dropdown should show Himawari sectors
    const sectorSelect = document.getElementById('anim-sector') as HTMLSelectElement;
    const sectorOptions = Array.from(sectorSelect.querySelectorAll('option'));
    const sectorValues = sectorOptions.map(o => o.getAttribute('value') ?? '');
    expect(sectorValues).toContain('FLDK');
    expect(sectorValues).toContain('Japan');
    expect(sectorValues).toContain('Target');
  });
});

/* ── CompositesTab ───────────────────────────────────── */

describe('CompositesTab Himawari support', () => {
  it('shows Himawari-9 in satellite dropdown when recipe selected', async () => {
    const CompositesTab = (await import('../components/GoesData/CompositesTab')).default;

    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/products') return Promise.resolve({ data: HIMAWARI_PRODUCTS });
      if (url === '/satellite/composite-recipes') return Promise.resolve({ data: [{ id: 'true_color', name: 'True Color', bands: ['C01', 'C02', 'C03'] }] });
      if (url === '/satellite/composites') return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<CompositesTab />);

    // Click a recipe to reveal the generate form
    await waitFor(() => {
      expect(screen.getByText('True Color')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('True Color'));

    // Now satellite dropdown should be visible
    await waitFor(() => {
      const satSelect = document.getElementById('comp-satellite') as HTMLSelectElement;
      expect(satSelect).toBeTruthy();
      const options = Array.from(satSelect.querySelectorAll('option'));
      expect(options.map(o => o.textContent)).toContain('Himawari-9');
    });
  });

  it('updates sector options when satellite changes to Himawari', async () => {
    const CompositesTab = (await import('../components/GoesData/CompositesTab')).default;

    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/products') return Promise.resolve({ data: HIMAWARI_PRODUCTS });
      if (url === '/satellite/composite-recipes') return Promise.resolve({ data: [{ id: 'true_color', name: 'True Color', bands: ['C01', 'C02', 'C03'] }] });
      if (url === '/satellite/composites') return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<CompositesTab />);

    // Click a recipe to show the generate form
    await waitFor(() => {
      expect(screen.getByText('True Color')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('True Color'));

    // Wait for satellite select to appear
    await waitFor(() => {
      expect(document.getElementById('comp-satellite')).toBeTruthy();
    });

    // Switch to Himawari-9
    const satSelect = document.getElementById('comp-satellite') as HTMLSelectElement;
    fireEvent.change(satSelect, { target: { value: 'Himawari-9' } });

    // Sector should now show Himawari options
    await waitFor(() => {
      const sectorSelect = document.getElementById('comp-sector') as HTMLSelectElement;
      const options = Array.from(sectorSelect.querySelectorAll('option'));
      const sectorIds = options.map(o => o.getAttribute('value'));
      expect(sectorIds).toContain('FLDK');
      expect(sectorIds).toContain('Japan');
    });
  });
});
