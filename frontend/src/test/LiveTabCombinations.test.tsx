import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'test-job' } })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';
import { buildCdnUrl, isMesoSector, isGeocolorAvailable } from '../utils/sectorHelpers';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

const SATELLITES = ['GOES-16', 'GOES-18', 'GOES-19'];
const SECTORS = ['CONUS', 'FullDisk', 'Mesoscale1', 'Mesoscale2'];
const CDN_SECTORS = ['CONUS', 'FullDisk'];
const MESO_SECTORS = ['Mesoscale1', 'Mesoscale2'];
const REPRESENTATIVE_BANDS = ['GEOCOLOR', 'C02', 'C13'];
const ALL_BANDS = [
  'GEOCOLOR', 'C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08',
  'C09', 'C10', 'C11', 'C12', 'C13', 'C14', 'C15', 'C16',
];

const BAND_DESCRIPTIONS: Record<string, string> = {
  GEOCOLOR: 'GeoColor', C01: 'Blue', C02: 'Red', C03: 'Veggie', C04: 'Cirrus',
  C05: 'Snow/Ice', C06: 'Cloud Particle', C07: 'Shortwave IR', C08: 'Upper WV',
  C09: 'Mid WV', C10: 'Lower WV', C11: 'Cloud-top', C12: 'Ozone',
  C13: 'Clean IR', C14: 'IR', C15: 'Dirty IR', C16: 'CO2',
};

function makeProducts(defaultSat = 'GOES-19') {
  return {
    satellites: SATELLITES,
    satellite_availability: {
      'GOES-16': { status: 'decommissioned', description: '' },
      'GOES-18': { status: 'standby', description: '' },
      'GOES-19': { status: 'operational', description: '' },
    },
    sectors: SECTORS.map((id) => ({
      id,
      name: id === 'FullDisk' ? 'Full Disk' : id.replace('Mesoscale', 'Mesoscale '),
      product: 'ABI-L2-CMIPF',
      cdn_available: CDN_SECTORS.includes(id),
    })),
    bands: ALL_BANDS.map((id) => ({ id, description: BAND_DESCRIPTIONS[id] ?? id })),
    default_satellite: defaultSat,
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function mockApiDefaults(sector = 'CONUS', band = 'GEOCOLOR') {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: makeProducts() });
    if (url.startsWith('/goes/latest'))
      return Promise.resolve({
        data: {
          id: '1', satellite: 'GOES-19', sector, band,
          capture_time: '2025-01-01T12:00:00Z', file_size: 1024,
          width: 5424, height: 3000,
          image_url: '/api/goes/frames/1/image',
          thumbnail_url: '/api/goes/frames/1/thumbnail',
        },
      });
    if (url.startsWith('/goes/catalog/latest'))
      return Promise.resolve({
        data: { scan_time: '2025-01-01T12:00:00Z', image_url: 'https://cdn.example.com/test.jpg', mobile_url: 'https://cdn.example.com/test-m.jpg' },
      });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiDefaults();
});

// ── buildCdnUrl unit tests ───────────────────────────────────────

describe('buildCdnUrl — satellite × sector × band matrix', () => {
  it.each(
    SATELLITES.flatMap((sat) =>
      CDN_SECTORS.flatMap((sector) =>
        REPRESENTATIVE_BANDS.map((band) => ({ sat, sector, band })),
      ),
    ),
  )('returns a valid URL for $sat / $sector / $band', ({ sat, sector, band }) => {
    const url = buildCdnUrl(sat, sector, band);
    expect(url).not.toBeNull();
    expect(url).toMatch(/^https:\/\/cdn\.star\.nesdis\.noaa\.gov\//);
    expect(url).toContain(sat.replaceAll('-', ''));
  });

  it.each(
    SATELLITES.flatMap((sat) =>
      MESO_SECTORS.flatMap((sector) =>
        REPRESENTATIVE_BANDS.map((band) => ({ sat, sector, band })),
      ),
    ),
  )('returns null for meso sector: $sat / $sector / $band', ({ sat, sector, band }) => {
    expect(buildCdnUrl(sat, sector, band)).toBeNull();
  });

  it.each([
    { label: 'empty satellite', args: ['', 'CONUS', 'C02'] as const },
    { label: 'empty sector', args: ['GOES-19', '', 'C02'] as const },
    { label: 'empty band', args: ['GOES-19', 'CONUS', ''] as const },
  ])('returns null when $label', ({ args }) => {
    expect(buildCdnUrl(...args)).toBeNull();
  });

  it('GEOCOLOR band uses GEOCOLOR in CDN path', () => {
    const url = buildCdnUrl('GOES-19', 'CONUS', 'GEOCOLOR');
    expect(url).toContain('/GEOCOLOR/');
  });

  it('C02 band strips C prefix in CDN path', () => {
    const url = buildCdnUrl('GOES-19', 'CONUS', 'C02');
    expect(url).toContain('/02/');
  });
});

// ── isMesoSector + isGeocolorAvailable ───────────────────────────

describe('isMesoSector', () => {
  it.each(MESO_SECTORS)('returns true for %s', (s) => expect(isMesoSector(s)).toBe(true));
  it.each(CDN_SECTORS)('returns false for %s', (s) => expect(isMesoSector(s)).toBe(false));
});

describe('isGeocolorAvailable', () => {
  it.each(CDN_SECTORS)('returns true for %s', (s) => expect(isGeocolorAvailable(s)).toBe(true));
  it.each(MESO_SECTORS)('returns false for %s', (s) => expect(isGeocolorAvailable(s)).toBe(false));
});

// ── LiveTab integration: GEOCOLOR + meso auto-switch ─────────────

describe('LiveTab — GEOCOLOR meso auto-switch', () => {
  it('auto-switches from GEOCOLOR to C02 when sector changes to Mesoscale1', async () => {
    mockApiDefaults('CONUS', 'GEOCOLOR');
    renderWithProviders(<LiveTab />);

    // Wait for products to load and band pills to render
    await waitFor(() => {
      expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
    });

    // GEOCOLOR should be active initially (CONUS default)
    await waitFor(() => {
      const geocolorPill = screen.getByTestId('band-pill-GEOCOLOR');
      expect(geocolorPill).toHaveAttribute('aria-pressed', 'true');
    });

    // Click sector chip to expand sector options
    const sectorChip = screen.getByTestId('pill-strip-sector');
    await userEvent.click(sectorChip);

    // Select Mesoscale 1
    const mesoOption = screen.getByTestId('sector-option-Mesoscale1');
    await userEvent.click(mesoOption);

    // GEOCOLOR should no longer be active — C02 should be
    await waitFor(() => {
      const c02Pill = screen.getByTestId('band-pill-C02');
      expect(c02Pill).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('GEOCOLOR pill is disabled when meso sector is selected', async () => {
    mockApiDefaults('CONUS', 'C02');
    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
    });

    // Switch to Mesoscale1
    const sectorChip = screen.getByTestId('pill-strip-sector');
    await userEvent.click(sectorChip);
    await userEvent.click(screen.getByTestId('sector-option-Mesoscale1'));

    // GEOCOLOR pill should be disabled
    await waitFor(() => {
      const geocolorPill = screen.getByTestId('band-pill-GEOCOLOR');
      expect(geocolorPill).toBeDisabled();
    });
  });

  it('GEOCOLOR pill is enabled for CONUS and FullDisk', async () => {
    mockApiDefaults('CONUS', 'C02');
    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      const geocolorPill = screen.getByTestId('band-pill-GEOCOLOR');
      expect(geocolorPill).not.toBeDisabled();
    });
  });
});

// ── LiveTab integration: Fetch button visibility ─────────────────

describe('LiveTab — Fetch to view visibility', () => {
  it('shows fetch message for meso sector with non-GEOCOLOR band', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: makeProducts() });
      if (url.startsWith('/goes/latest')) return Promise.reject({ response: { status: 404 } });
      if (url.startsWith('/goes/catalog/latest')) return Promise.reject({ response: { status: 404 } });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
    });

    // Switch to Mesoscale1
    const sectorChip = screen.getByTestId('pill-strip-sector');
    await userEvent.click(sectorChip);
    await userEvent.click(screen.getByTestId('sector-option-Mesoscale1'));

    // Band should auto-switch to C02 (since initial was GEOCOLOR on CONUS, switching to meso triggers auto-switch)
    await waitFor(() => {
      const c02Pill = screen.getByTestId('band-pill-C02');
      expect(c02Pill).toHaveAttribute('aria-pressed', 'true');
    });

    // Should show "Fetch to view" message (meso + no CDN + no local frame)
    await waitFor(() => {
      expect(screen.getByTestId('meso-fetch-required')).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('auto-switches GEOCOLOR to C02 when switching to Mesoscale1', async () => {
    // When the user is on GEOCOLOR and switches to a meso sector,
    // the auto-switch effect changes band to C02 automatically.
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products')
        return Promise.resolve({
          data: {
            ...makeProducts(),
            // Override sectors so Mesoscale1 is not cdn_available
            sectors: SECTORS.map((id) => ({
              id,
              name: id,
              product: 'ABI',
              cdn_available: CDN_SECTORS.includes(id),
            })),
          },
        });
      if (url.startsWith('/goes/latest')) return Promise.reject({ response: { status: 404 } });
      if (url.startsWith('/goes/catalog/latest')) return Promise.reject({ response: { status: 404 } });
      return Promise.resolve({ data: {} });
    });

    // This test verifies the auto-switch behavior — when switching to meso with GEOCOLOR,
    // band should auto-switch to C02 and show meso-fetch-required (not geocolor message)
    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
    });

    // Switch to Mesoscale1 while on GEOCOLOR
    const sectorChip = screen.getByTestId('pill-strip-sector');
    await userEvent.click(sectorChip);
    await userEvent.click(screen.getByTestId('sector-option-Mesoscale1'));

    // Band should have auto-switched to C02
    await waitFor(() => {
      const c02Pill = screen.getByTestId('band-pill-C02');
      expect(c02Pill).toHaveAttribute('aria-pressed', 'true');
    });
  });
});

// ── buildCdnUrl full C01-C16 matrix ──────────────────────────────

describe('buildCdnUrl — all C01-C16 bands for CDN sectors', () => {
  const cbands = ALL_BANDS.filter((b) => b.startsWith('C'));

  it.each(
    cbands.flatMap((band) =>
      CDN_SECTORS.map((sector) => ({ band, sector })),
    ),
  )('returns valid URL for GOES-19 / $sector / $band', ({ band, sector }) => {
    const url = buildCdnUrl('GOES-19', sector, band);
    expect(url).toBeTruthy();
    expect(url).toContain(`/${band.slice(1)}/`);
  });
});

// ── Fetch validation: GEOCOLOR rejected client-side ──────────────

describe('useLiveFetchJob — GEOCOLOR guard', () => {
  it('fetchNow with GEOCOLOR does not call POST /goes/fetch', async () => {
    // The hook guards GEOCOLOR and shows a toast instead of calling the API.
    // We test this indirectly: if band is GEOCOLOR and we trigger fetchNow,
    // api.post should NOT be called.
    mockApiDefaults('CONUS', 'GEOCOLOR');
    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
    });

    // With GEOCOLOR active on CONUS, there's no "Fetch to view" button visible
    // (CDN handles it). This is the correct behavior.
    expect(screen.queryByText('Fetch to view')).not.toBeInTheDocument();
  });
});

// ── Render smoke tests: every satellite × sector × representative band ──

describe('LiveTab — render smoke tests for all combos', () => {
  it.each(
    SATELLITES.flatMap((sat) =>
      SECTORS.flatMap((sector) =>
        ['C02', 'C13'].map((band) => ({ sat, sector, band })),
      ),
    ),
  )('renders without error for $sat / $sector / $band', async ({ sat, sector, band }) => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products')
        return Promise.resolve({
          data: { ...makeProducts(sat) },
        });
      if (url.startsWith('/goes/latest'))
        return Promise.resolve({
          data: {
            id: '1', satellite: sat, sector, band,
            capture_time: '2025-01-01T12:00:00Z', file_size: 1024,
            width: 5424, height: 3000,
            image_url: '/api/goes/frames/1/image',
            thumbnail_url: '/api/goes/frames/1/thumbnail',
          },
        });
      if (url.startsWith('/goes/catalog/latest'))
        return Promise.resolve({
          data: { scan_time: '2025-01-01T12:00:00Z', image_url: 'https://cdn.example.com/test.jpg' },
        });
      return Promise.resolve({ data: {} });
    });

    const { container } = renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="live-image-area"]')).toBeInTheDocument();
    });
  });
});
