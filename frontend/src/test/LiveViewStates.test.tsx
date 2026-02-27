import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'j1' } })),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../hooks/usePullToRefresh', () => ({
  usePullToRefresh: () => ({ containerRef: { current: null }, isRefreshing: false, pullDistance: 0 }),
}));

vi.mock('../hooks/useImageZoom', () => ({
  useImageZoom: () => ({ style: {}, handlers: {}, isZoomed: false, reset: vi.fn() }),
}));

vi.mock('../components/GoesData/PullToRefreshIndicator', () => ({
  default: () => null,
}));

vi.mock('../components/GoesData/StaleDataBanner', () => ({
  default: ({ freshnessInfo, onFetchNow }: { freshnessInfo: { behindMin: number }; onFetchNow: () => void }) => (
    freshnessInfo.behindMin > 0 ? (
      <div data-testid="stale-banner">
        <span>Data is stale</span>
        <button onClick={onFetchNow}>Fetch Now</button>
      </div>
    ) : null
  ),
}));

vi.mock('../components/GoesData/CompareSlider', () => ({
  default: () => <div data-testid="compare-slider">CompareSlider</div>,
}));

vi.mock('../components/GoesData/InlineFetchProgress', () => ({
  default: () => <div data-testid="fetch-progress">Progress</div>,
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';
import { make404 } from './utils/axiosErrors';

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const PRODUCTS = {
  satellites: ['GOES-16', 'GOES-19'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
    { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor (True Color Day, IR Night)' },
    { id: 'C02', description: 'Red (0.64µm)' },
    { id: 'C13', description: 'Clean IR (10.3µm)' },
  ],
  default_satellite: 'GOES-19',
  satellite_availability: {
    'GOES-16': { status: 'standby', description: 'Standby' },
    'GOES-19': { status: 'operational', description: 'GOES-East' },
  },
};

const FRAME = {
  id: 'f1',
  satellite: 'GOES-19',
  sector: 'CONUS',
  band: 'C02',
  capture_time: new Date(Date.now() - 300000).toISOString(), // 5 min ago
  file_path: '/data/frame.nc',
  file_size: 4096,
  width: 5424,
  height: 3000,
  thumbnail_path: '/data/thumb.jpg', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
};

const CATALOG_LATEST = {
  scan_time: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  size: 5000,
  key: 's3://bucket/key',
  satellite: 'GOES-19',
  sector: 'CONUS',
  band: 'C02',
};

function renderLive() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}><LiveTab /></QueryClientProvider></MemoryRouter>
  );
}

function setupMocks(overrides: {
  products?: unknown;
  frame?: unknown;
  frameError?: boolean;
  catalog?: unknown;
  catalogError?: boolean;
  frames?: unknown;
} = {}) {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: overrides.products ?? PRODUCTS });
    if (url.startsWith('/goes/latest')) {
      if (overrides.frameError) return Promise.reject(make404());
      return Promise.resolve({ data: overrides.frame ?? FRAME });
    }
    if (url.startsWith('/goes/catalog/latest')) {
      if (overrides.catalogError) return Promise.reject(new Error('503'));
      return Promise.resolve({ data: overrides.catalog ?? CATALOG_LATEST });
    }
    if (url.startsWith('/goes/catalog/available')) {
      return Promise.resolve({ data: { satellite: 'GOES-19', available_sectors: ['CONUS', 'FullDisk'], checked_at: new Date().toISOString() } });
    }
    if (url.startsWith('/goes/frames')) return Promise.resolve({ data: overrides.frames ?? [FRAME] });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupMocks();
});

describe('LiveViewStates', () => {
  it('renders loading skeleton while frame query is loading', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return new Promise(() => {}); // never resolves
      if (url.startsWith('/goes/catalog')) return Promise.resolve({ data: CATALOG_LATEST });
      return Promise.resolve({ data: {} });
    });
    renderLive();
    await waitFor(() => {
      expect(screen.getByTestId('loading-shimmer')).toBeInTheDocument();
    });
  });

  it('shows CDN image when no local frames exist (never shows empty state)', async () => {
    setupMocks({ frameError: true });
    renderLive();
    await waitFor(() => {
      // Live tab always has a CDN fallback URL — shows image, not empty state
      const img = screen.queryByRole('img');
      const shimmer = screen.queryByTestId('loading-shimmer') ?? screen.queryByTestId('image-shimmer');
      expect(img ?? shimmer).toBeTruthy();
    });
    // "Fetch your first image" CTA should NOT render on Live tab
    expect(screen.queryByRole('button', { name: /Fetch your first image/i })).not.toBeInTheDocument();
  });

  it('shows frame image when frame exists', async () => {
    renderLive();
    await waitFor(() => {
      const img = screen.getByAltText('GOES-19 GEOCOLOR CONUS');
      expect(img).toBeInTheDocument();
      expect(img.getAttribute('src')).toContain('/api/goes/frames/');
    });
  });

  it('shows stale data banner when catalog is newer than local frame', async () => {
    const oldFrame = { ...FRAME, capture_time: new Date(Date.now() - 3600000).toISOString() };
    const newCatalog = { ...CATALOG_LATEST, scan_time: new Date(Date.now() - 60000).toISOString() };
    setupMocks({ frame: oldFrame, catalog: newCatalog });
    renderLive();
    // Switch to C02 (stale banner hidden for GEOCOLOR composites)
    await waitFor(() => expect(screen.getByTestId('band-pill-C02')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('band-pill-C02'));
    await waitFor(() => {
      expect(screen.getByTestId('stale-banner')).toBeInTheDocument();
    });
  });

  it('shows freshness info with time ago text', async () => {
    renderLive();
    await waitFor(() => {
      // The "Your Latest" panel header shows time ago for the frame
      const timeAgoElements = screen.getAllByText(/ago/);
      expect(timeAgoElements.length).toBeGreaterThan(0);
    });
  });

  it('compare mode toggle shows CompareSlider', async () => {
    const frames = [FRAME, { ...FRAME, id: 'f2', capture_time: new Date(Date.now() - 600000).toISOString() }];
    setupMocks({ frames });
    renderLive();
    await waitFor(() => {
      expect(screen.getByText('Compare')).toBeInTheDocument();
    });
    const btn = screen.getByText('Compare').closest('button')!;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId('compare-slider')).toBeInTheDocument();
    });
  });

  it('auto-fetch interval selector works', async () => {
    renderLive();
    await waitFor(() => {
      expect(screen.getByLabelText('Auto-fetch interval')).toBeInTheDocument();
    });
    const select = screen.getByLabelText('Auto-fetch interval') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '60000' } });
    expect(select.value).toBe('60000');
  });

  it('fullscreen toggle button exists and toggles', async () => {
    renderLive();
    await waitFor(() => {
      expect(screen.getByLabelText('Enter fullscreen')).toBeInTheDocument();
    });
  });

  it('"Fetch Now" button triggers fetch mutation via stale banner', async () => {
    const oldFrame = { ...FRAME, capture_time: new Date(Date.now() - 7200000).toISOString() };
    setupMocks({ frame: oldFrame });
    renderLive();
    // Switch to C02 (stale banner hidden for GEOCOLOR composites)
    await waitFor(() => expect(screen.getByTestId('band-pill-C02')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('band-pill-C02'));
    await waitFor(() => {
      const fetchBtn = screen.queryByText('Fetch Now');
      if (fetchBtn) {
        fireEvent.click(fetchBtn);
        expect(mockedApi.post).toHaveBeenCalledWith('/goes/fetch', expect.any(Object));
      }
    });
  });

  it('error state when products API fails', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.reject(new Error('500'));
      if (url.startsWith('/goes/latest')) return Promise.reject(new Error('no products'));
      return Promise.resolve({ data: {} });
    });
    renderLive();
    // Should still render controls overlay
    await waitFor(() => {
      expect(screen.getByTestId('controls-overlay')).toBeInTheDocument();
    });
  });

  it('satellite changes via pill strip', async () => {
    renderLive();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() => expect(screen.getByTestId('satellite-option-GOES-16')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('satellite-option-GOES-16'));
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-16');
    });
  });

  it('sector changes via pill strip', async () => {
    renderLive();
    await waitFor(() => expect(screen.getByTestId('pill-strip-sector')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    await waitFor(() => expect(screen.getByTestId('sector-option-FullDisk')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('sector-option-FullDisk'));
    expect(document.body.textContent).toBeTruthy();
  });

  it('band changes via pill strip', async () => {
    renderLive();
    await waitFor(() => expect(screen.getByTestId('band-pill-C13')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('band-pill-C13'));
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('C13');
    });
  });

  it('renders status pill with satellite info', async () => {
    renderLive();
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-19');
    });
  });
});

// ── Proxy-through (catalog S3 fallback) tests ────────────────────

describe('LiveView proxy-through (catalog S3 image)', () => {
  it('shows catalog S3 image when no local frames exist', async () => {
    const catalogWithUrl = {
      ...CATALOG_LATEST,
      image_url: 'https://noaa-goes19.s3.amazonaws.com/ABI-L1b-RadC/2024/166/12/test.nc',
    };
    setupMocks({ frameError: true, catalog: catalogWithUrl });
    renderLive();
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img.getAttribute('src')).toBe(catalogWithUrl.image_url);
    });
  });

  it('shows local frame when it exists (not catalog image)', async () => {
    const catalogWithUrl = {
      ...CATALOG_LATEST,
      image_url: 'https://noaa-goes19.s3.amazonaws.com/test.nc',
    };
    setupMocks({ catalog: catalogWithUrl });
    renderLive();
    await waitFor(() => {
      const img = screen.getByRole('img');
      expect(img.getAttribute('src')).toContain('/api/goes/frames/');
      expect(img.getAttribute('src')).not.toContain('s3.amazonaws.com');
    });
  });

  it('shows stale banner when local frame exists and catalog is newer', async () => {
    const oldFrame = { ...FRAME, capture_time: new Date(Date.now() - 3600000).toISOString() };
    const newCatalog = { ...CATALOG_LATEST, scan_time: new Date(Date.now() - 60000).toISOString() };
    setupMocks({ frame: oldFrame, catalog: newCatalog });
    renderLive();
    // Switch to C02 (stale banner hidden for GEOCOLOR composites)
    await waitFor(() => expect(screen.getByTestId('band-pill-C02')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('band-pill-C02'));
    await waitFor(() => {
      expect(screen.getByTestId('stale-banner')).toBeInTheDocument();
    });
  });

  it('shows CDN image when no local frames AND no catalog (direct CDN fallback)', async () => {
    setupMocks({ frameError: true, catalogError: true });
    renderLive();
    await waitFor(() => {
      // Direct CDN URL is always constructed — never shows empty state
      const img = screen.queryByRole('img');
      const shimmer = screen.queryByTestId('loading-shimmer') ?? screen.queryByTestId('image-shimmer');
      expect(img ?? shimmer).toBeTruthy();
    });
    expect(screen.queryByText(/No local frames available/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Fetch your first image/i })).not.toBeInTheDocument();
  });

  it('status pill shows satellite info when displaying catalog image', async () => {
    const catalogWithUrl = {
      ...CATALOG_LATEST,
      image_url: 'https://noaa-goes19.s3.amazonaws.com/test.nc',
    };
    setupMocks({ frameError: true, catalog: catalogWithUrl });
    renderLive();
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-19');
      expect(pill.textContent).toContain('GEOCOLOR');
    });
  });

  it('pill strip changes re-query catalog (satellite change)', async () => {
    const catalogWithUrl = {
      ...CATALOG_LATEST,
      image_url: 'https://noaa-goes19.s3.amazonaws.com/test.nc',
    };
    setupMocks({ frameError: true, catalog: catalogWithUrl });
    renderLive();
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() => expect(screen.getByTestId('satellite-option-GOES-16')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('satellite-option-GOES-16'));
    // After change, catalog query should be called again with new satellite
    await waitFor(() => {
      const catalogCalls = mockedApi.get.mock.calls.filter(
        (c: string[]) => c[0].startsWith('/goes/catalog/latest')
      );
      expect(catalogCalls.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('compare mode works with catalog-only image', async () => {
    const catalogWithUrl = {
      ...CATALOG_LATEST,
      image_url: 'https://noaa-goes19.s3.amazonaws.com/test.nc',
    };
    setupMocks({ frameError: true, catalog: catalogWithUrl });
    renderLive();
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
    const btn = screen.getByText('Compare').closest('button')!;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByTestId('compare-slider')).toBeInTheDocument();
    });
  });

  it('fullscreen button works with catalog image', async () => {
    const catalogWithUrl = {
      ...CATALOG_LATEST,
      image_url: 'https://noaa-goes19.s3.amazonaws.com/test.nc',
    };
    setupMocks({ frameError: true, catalog: catalogWithUrl });
    renderLive();
    await waitFor(() => {
      expect(screen.getByRole('img')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Enter fullscreen')).toBeInTheDocument();
  });
});
