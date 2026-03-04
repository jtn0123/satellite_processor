/**
 * Integration test: FrameGallery filter → display → compare selection flow.
 *
 * Only the HTTP layer (api client) is mocked — React Query, hooks, and child
 * components render for real, exercising the full data flow pipeline.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { GoesFrame, PaginatedFrames, FrameStats } from '../../components/GoesData/types';

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

import FrameGallery from '../../components/GoesData/FrameGallery';
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
  return { items, total: total ?? items.length, page: 1, limit: 24 };
}

const defaultStats: FrameStats = {
  total_frames: 10,
  total_size_bytes: 10240,
  by_satellite: { 'GOES-16': { count: 6, size: 6000 }, 'GOES-18': { count: 4, size: 4000 } },
  by_band: { C02: { count: 5, size: 5000 }, C13: { count: 5, size: 5000 } },
};

function setupApiResponses(frames: GoesFrame[] = [], stats: FrameStats = defaultStats) {
  mockedGet.mockImplementation((url: string) => {
    if (url.includes('stats')) return Promise.resolve({ data: stats });
    if (url.startsWith('/satellite/frames') || url === '/satellite/frames') {
      return Promise.resolve({ data: paginated(frames) });
    }
    return Promise.resolve({ data: {} });
  });
}

function renderGallery() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <FrameGallery />
    </QueryClientProvider>,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks();
});

describe('FrameGallery filter → display integration', () => {
  it('renders frame count and filter dropdowns from API data', async () => {
    const frames = [
      makeFrame({ id: 'f1', satellite: 'GOES-16' }),
      makeFrame({ id: 'f2', satellite: 'GOES-18' }),
      makeFrame({ id: 'f3', satellite: 'GOES-16' }),
    ];
    setupApiResponses(frames);

    renderGallery();

    // Frame count shows up
    await waitFor(() => {
      expect(screen.getByText(/3 frames/)).toBeInTheDocument();
    });

    // Satellite filter should list satellites from stats
    const satSelect = screen.getByLabelText(/filter by satellite/i);
    expect(satSelect).toBeInTheDocument();
  });

  it('changing satellite filter triggers a new API call', async () => {
    const user = userEvent.setup();
    const frames = [makeFrame({ satellite: 'GOES-16' })];
    setupApiResponses(frames);

    renderGallery();

    // Wait for stats to load and populate dropdown options
    await waitFor(() => {
      const satSelect = screen.getByLabelText(/filter by satellite/i);
      expect(satSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    // Change satellite filter
    const satSelect = screen.getByLabelText(/filter by satellite/i);
    await user.selectOptions(satSelect, 'GOES-18');

    // Should trigger new frame fetch with satellite param
    await waitFor(() => {
      const frameCalls = mockedGet.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/satellite/frames') && !call[0].includes('stats'),
      );
      const hasFilteredCall = frameCalls.some(
        (call) => call[1]?.params?.satellite === 'GOES-18',
      );
      expect(hasFilteredCall).toBe(true);
    });
  });

  it('changing band filter triggers a new API call with band param', async () => {
    const user = userEvent.setup();
    const frames = [makeFrame({ band: 'C02' })];
    setupApiResponses(frames);

    renderGallery();

    // Wait for stats to load and populate dropdown options
    await waitFor(() => {
      const bandSelect = screen.getByLabelText(/filter by band/i);
      expect(bandSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    // Change band filter
    const bandSelect = screen.getByLabelText(/filter by band/i);
    await user.selectOptions(bandSelect, 'C13');

    await waitFor(() => {
      const frameCalls = mockedGet.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].startsWith('/satellite/frames') && !call[0].includes('stats'),
      );
      const hasFilteredCall = frameCalls.some(
        (call) => call[1]?.params?.band === 'C13',
      );
      expect(hasFilteredCall).toBe(true);
    });
  });

  it('shows empty state when no frames are returned', async () => {
    setupApiResponses([]);

    renderGallery();

    await waitFor(() => {
      expect(screen.getByText(/0 frames/)).toBeInTheDocument();
    });
  });
});
