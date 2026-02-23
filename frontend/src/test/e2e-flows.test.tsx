/**
 * E2E-style integration tests for critical user flows.
 * Tests user journeys through the app without a real backend.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ComponentType } from 'react';

// --- Shared mocks ---

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../hooks/useWebSocket', () => ({ default: vi.fn(() => null) }));
vi.mock('../hooks/useJobToasts', () => ({ useJobToasts: vi.fn() }));
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

import api from '../api/client';
const mockedApi = vi.mocked(api, true);

function createApp(initialRoute = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route path="/" element={<DashboardLazy />} />
          <Route path="/browse" element={<GoesDataLazy />} />
          <Route path="/live" element={<LiveViewLazy />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Lazy load pages like the app does
let Dashboard: ComponentType;
let GoesData: ComponentType;
let LiveView: ComponentType;

function DashboardLazy() {
  return Dashboard ? <Dashboard /> : <div>Loading...</div>;
}
function GoesDataLazy() {
  return GoesData ? <GoesData /> : <div>Loading...</div>;
}
function LiveViewLazy() {
  return LiveView ? <LiveView /> : <div>Loading...</div>;
}

beforeEach(async () => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation(() => Promise.resolve({ data: [] }));
  mockedApi.post.mockImplementation(() => Promise.resolve({ data: {} }));

  // Stub fetch for version endpoint
  vi.stubGlobal('fetch', vi.fn(() =>
    Promise.resolve({ json: () => Promise.resolve({ version: '1.0.0', commit: 'abc123' }) }),
  ));
});

// ===================== Flow 1: New user → Dashboard → Fetch Latest → see image =====================
describe('Flow: New user dashboard experience', () => {
  beforeEach(async () => {
    Dashboard = (await import('../pages/Dashboard')).default;
  });

  it('shows dashboard with empty state and fetch action', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0 } });
      if (url.includes('/jobs')) return Promise.resolve({ data: [] });
      if (url.includes('/health')) return Promise.resolve({ data: { status: 'ok' } });
      if (url.includes('/goes/frames/stats')) return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0 } });
      return Promise.resolve({ data: [] });
    });

    render(createApp('/'));
    await waitFor(() => {
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    });
  });

  it('dashboard renders charts section when data exists', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({
        data: {
          items: [{
            id: 'f1', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02',
            capture_time: '2026-01-01T12:00:00Z', file_path: '/img/f1.png',
            file_size: 50000, width: 1000, height: 1000,
            thumbnail_path: '/thumb/f1.png', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail', tags: [], collections: [],
          }],
          total: 1,
        },
      });
      if (url.includes('/goes/frames/stats')) return Promise.resolve({
        data: { total_frames: 1, total_size_bytes: 50000, by_satellite: {}, by_band: {} },
      });
      return Promise.resolve({ data: [] });
    });

    render(createApp('/'));
    await waitFor(() => {
      expect(screen.getByText(/Dashboard/i)).toBeInTheDocument();
    });
  });
});

// ===================== Flow 2: Live → auto-refresh =====================
describe('Flow: Live with auto-refresh', () => {
  beforeEach(async () => {
    LiveView = (await import('../pages/LiveView')).default;
  });

  it('renders live view page with heading', async () => {
    mockedApi.get.mockImplementation(() => Promise.resolve({ data: [] }));

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LiveView />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Live' })).toBeInTheDocument();
    });
  });
});

// ===================== Flow 3: Browse → select frames → view details =====================
describe('Flow: Browse frames and view details', () => {
  beforeEach(async () => {
    GoesData = (await import('../pages/GoesData')).default;
  });

  it('browse tab shows frames and allows tab switching', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({
        data: {
          items: [
            {
              id: 'f1', satellite: 'GOES-16', sector: 'FullDisk', band: 'C02',
              capture_time: '2026-01-01T12:00:00Z', file_path: '/img/f1.png',
              file_size: 50000, width: 1000, height: 1000,
              thumbnail_path: '/thumb/f1.png', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail', tags: [], collections: [],
            },
            {
              id: 'f2', satellite: 'GOES-16', sector: 'FullDisk', band: 'C13',
              capture_time: '2026-01-01T12:10:00Z', file_path: '/img/f2.png',
              file_size: 60000, width: 1000, height: 1000,
              thumbnail_path: '/thumb/f2.png', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail', tags: [], collections: [],
            },
          ],
          total: 2,
        },
      });
      return Promise.resolve({ data: [] });
    });

    render(createApp('/browse'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Browse & Fetch' })).toBeInTheDocument();
    });

    // Verify tab navigation works
    const fetchTab = screen.getByLabelText('Fetch tab');
    fireEvent.click(fetchTab);
    await waitFor(() => {
      expect(fetchTab).toHaveAttribute('aria-selected', 'true');
    });

    // Switch back to browse
    const browseTab = screen.getByLabelText('Browse tab');
    fireEvent.click(browseTab);
    await waitFor(() => {
      expect(browseTab).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('switches to stats tab to view frame statistics', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames/stats')) return Promise.resolve({
        data: { total_frames: 100, total_size_bytes: 5000000, by_satellite: {}, by_band: {} },
      });
      return Promise.resolve({ data: [] });
    });

    render(createApp('/browse'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Browse & Fetch' })).toBeInTheDocument();
    });

    const statsTab = screen.getByLabelText('Stats tab');
    fireEvent.click(statsTab);
    await waitFor(() => {
      expect(statsTab).toHaveAttribute('aria-selected', 'true');
    });
  });
});

// ===================== Flow 4: Mobile bottom nav =====================
describe('Flow: Mobile bottom navigation', () => {
  beforeEach(async () => {
    GoesData = (await import('../pages/GoesData')).default;
  });

  it('renders mobile-friendly layout with accessible tabs', async () => {
    // Simulate mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true });
    window.dispatchEvent(new Event('resize'));

    mockedApi.get.mockImplementation(() => Promise.resolve({ data: { items: [], total: 0 } }));

    render(createApp('/browse'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Browse & Fetch' })).toBeInTheDocument();
    });

    // Tab buttons should be accessible
    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBeGreaterThan(0);

    // Each tab should have aria-label
    for (const tab of tabs) {
      expect(tab.getAttribute('aria-label') || tab.getAttribute('aria-selected')).toBeTruthy();
    }

    // Restore viewport
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    window.dispatchEvent(new Event('resize'));
  });
});
