/**
 * Integration test: BrowseTab filter → data display flow.
 *
 * Only the HTTP layer (api client) is mocked — everything else
 * (React Query, hooks, child components) runs for real so we
 * exercise the full render pipeline from filter change to
 * displayed frame cards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GoesFrame, PaginatedFrames, Product } from '../../components/GoesData/types';

// --- Mock only the HTTP transport layer -----------------------------------
vi.mock('../../api/client', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    interceptors: { response: { use: vi.fn() } },
  },
}));
vi.mock('../../utils/toast', () => ({ showToast: vi.fn() }));

import BrowseTab from '../../components/GoesData/BrowseTab';
import api from '../../api/client';

const mockedGet = vi.mocked(api.get);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeFrame(overrides: Partial<GoesFrame> = {}): GoesFrame {
  return {
    id: crypto.randomUUID(),
    satellite: 'GOES-16',
    sector: 'CONUS',
    band: 'C02',
    capture_time: '2026-01-15T12:00:00Z',
    image_url: '/api/satellite/frames/test/image',
    thumbnail_url: '/api/satellite/frames/test/thumbnail',
    file_size: 1024,
    width: 500,
    height: 500,
    tags: [],
    collections: [],
    ...overrides,
  };
}

function paginated(items: GoesFrame[], total?: number): PaginatedFrames {
  return { items, total: total ?? items.length, page: 1, limit: 50 };
}

const defaultProducts: Product = {
  satellites: ['GOES-16', 'GOES-18'],
  bands: [
    { id: 'C02', description: 'Red Visible' },
    { id: 'C13', description: 'Clean IR Longwave' },
  ],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIP' },
    { id: 'FD', name: 'Full Disk', product: 'ABI-L2-CMIP' },
  ],
};

function setupApiResponses(frames: GoesFrame[] = [], products: Product = defaultProducts) {
  mockedGet.mockImplementation((url: string) => {
    if (url === '/satellite/products') return Promise.resolve({ data: products });
    if (url === '/satellite/tags') return Promise.resolve({ data: [] });
    if (url === '/satellite/collections') return Promise.resolve({ data: [] });
    // Default frames endpoint — filter-aware
    if (url.startsWith('/satellite/frames') || url === '/satellite/frames') {
      return Promise.resolve({ data: paginated(frames) });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderBrowse() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <BrowseTab />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe('BrowseTab filter → display integration', () => {
  it('renders frame cards when the API returns data', async () => {
    const frames = [
      makeFrame({ id: 'f1', satellite: 'GOES-16', band: 'C02' }),
      makeFrame({ id: 'f2', satellite: 'GOES-18', band: 'C13' }),
    ];
    setupApiResponses(frames);

    renderBrowse();

    // Wait for frame grid to render with our data
    await waitFor(() => {
      expect(screen.getByText(/2 frames/)).toBeInTheDocument();
    });

    // Both satellite names should appear in the rendered output
    expect(screen.getAllByText(/GOES-16/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GOES-18/).length).toBeGreaterThan(0);
  });

  it('shows empty state when no frames are returned', async () => {
    setupApiResponses([]);

    renderBrowse();

    await waitFor(() => {
      expect(screen.getByText(/no frames yet/i)).toBeInTheDocument();
    });
  });

  it('changing satellite filter triggers new API call with satellite param', async () => {
    const user = userEvent.setup();
    const frames = [makeFrame({ satellite: 'GOES-16' })];
    setupApiResponses(frames);

    renderBrowse();

    // Wait for products to load and populate the satellite dropdown
    // Use the specific browse-satellite select (label is "Satellite" via htmlFor)
    const satSelect = document.getElementById('browse-satellite') as HTMLSelectElement;
    expect(satSelect).toBeTruthy();
    await waitFor(() => {
      expect(satSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    await user.selectOptions(satSelect, 'GOES-18');

    // The API should be called again — the query key includes filterParams
    await waitFor(() => {
      const frameCalls = mockedGet.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/satellite/frames'),
      );
      // At least one call should include satellite=GOES-18 in params
      const hasFilteredCall = frameCalls.some((call) => call[1]?.params?.satellite === 'GOES-18');
      expect(hasFilteredCall).toBe(true);
    });
  });

  it('displays correct frame count after filters narrow results', async () => {
    // First call returns 5 frames, subsequent (filtered) returns 2
    let callCount = 0;
    const allFrames = Array.from({ length: 5 }, (_, i) =>
      makeFrame({ id: `f${i}`, satellite: i < 2 ? 'GOES-16' : 'GOES-18' }),
    );
    const filteredFrames = allFrames.filter((f) => f.satellite === 'GOES-16');

    mockedGet.mockImplementation((url: string) => {
      if (url === '/satellite/products') return Promise.resolve({ data: defaultProducts });
      if (url === '/satellite/tags') return Promise.resolve({ data: [] });
      if (url === '/satellite/collections') return Promise.resolve({ data: [] });
      if (url.startsWith('/satellite/frames') || url === '/satellite/frames') {
        callCount++;
        const data = callCount <= 1 ? paginated(allFrames, 5) : paginated(filteredFrames, 2);
        return Promise.resolve({ data });
      }
      return Promise.resolve({ data: {} });
    });

    const user = userEvent.setup();
    renderBrowse();

    await waitFor(() => {
      expect(screen.getByText(/5 frames/)).toBeInTheDocument();
    });

    // Wait for products to load and populate the satellite dropdown
    const satSelect = document.getElementById('browse-satellite') as HTMLSelectElement;
    expect(satSelect).toBeTruthy();
    await waitFor(() => {
      expect(satSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    // Apply satellite filter
    await user.selectOptions(satSelect, 'GOES-16');

    await waitFor(() => {
      expect(screen.getByText(/2 frames/)).toBeInTheDocument();
    });
  });
});
