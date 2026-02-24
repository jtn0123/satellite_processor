/**
 * Tests for Live View UX Round 3 features:
 * - Swipe gestures for band switching
 * - Auto-refresh countdown timer
 * - Condensed metadata overlay with expandable details
 * - Cached image banner (dismissible)
 * - Controls FAB label
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../hooks/useMonitorWebSocket', () => ({
  useMonitorWebSocket: () => ({ lastEvent: null }),
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

const mockedApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const PRODUCTS_DATA = {
  satellites: ['GOES-16', 'GOES-18'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
    { id: 'FD', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
  ],
  bands: [
    { id: 'C01', description: 'Blue (0.47µm)' },
    { id: 'C02', description: 'Red (0.64µm)' },
    { id: 'C03', description: 'Veggie (0.86µm)' },
  ],
};

const FRAME_DATA = {
  id: '1',
  satellite: 'GOES-16',
  sector: 'CONUS',
  band: 'C02',
  capture_time: new Date(Date.now() - 120000).toISOString(), // 2 min ago
  file_path: '/tmp/test.nc',
  file_size: 1024,
  width: 5424,
  height: 3000,
  thumbnail_path: null,
  image_url: '/api/goes/frames/test-id/image',
  thumbnail_url: '/api/goes/frames/test-id/thumbnail',
};

const CATALOG_DATA = {
  scan_time: new Date(Date.now() - 60000).toISOString(), // 1 min ago
  size: 2048,
  key: 'test-key',
  satellite: 'GOES-16',
  sector: 'CONUS',
  band: 'C02',
  image_url: 'https://cdn.example.com/image.png',
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </MemoryRouter>,
  );
}

function setupDefaultMocks() {
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS_DATA });
    if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME_DATA });
    if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: CATALOG_DATA });
    if (url.startsWith('/goes/catalog/available')) return Promise.resolve({ data: { satellite: 'GOES-16', available_sectors: ['CONUS', 'FD'], checked_at: new Date().toISOString() } });
    if (url.startsWith('/goes/frames')) return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  setupDefaultMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Swipe Gestures', () => {
  it('swipe left triggers next band', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => expect(screen.getByTestId('swipe-gesture-area')).toBeInTheDocument());

    const area = screen.getByTestId('swipe-gesture-area');
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 100, clientY: 200 }] });

    // Swipe left should go to next band (C02 -> C03)
    await waitFor(() => {
      const bandSelect = screen.getByLabelText('Band') as HTMLSelectElement;
      expect(bandSelect.value).toBe('C03');
    });
  });

  it('swipe right triggers previous band', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => expect(screen.getByTestId('swipe-gesture-area')).toBeInTheDocument());

    const area = screen.getByTestId('swipe-gesture-area');
    // First swipe left to get to C03
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 100, clientY: 200 }] });

    await waitFor(() => {
      expect((screen.getByLabelText('Band') as HTMLSelectElement).value).toBe('C03');
    });

    // Now swipe right to go back to C02
    fireEvent.touchStart(area, { touches: [{ clientX: 100, clientY: 200 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 300, clientY: 200 }] });

    await waitFor(() => {
      expect((screen.getByLabelText('Band') as HTMLSelectElement).value).toBe('C02');
    });
  });

  it('small swipe below threshold does nothing', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect((screen.getByLabelText('Band') as HTMLSelectElement).value).toBe('C02');
    });

    const area = screen.getByTestId('swipe-gesture-area');
    // Swipe only 30px (below 50px threshold)
    fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 200 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 170, clientY: 200 }] });

    // Band should remain C02
    const bandSelect = screen.getByLabelText('Band') as HTMLSelectElement;
    expect(bandSelect.value).toBe('C02');
  });

  it('swipe toast appears on band switch', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect((screen.getByLabelText('Band') as HTMLSelectElement).value).toBe('C02');
    });

    const area = screen.getByTestId('swipe-gesture-area');
    fireEvent.touchStart(area, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 100, clientY: 200 }] });

    // Swipe toast should appear with "C03 — Near-IR Veggie"
    await waitFor(() => {
      const matches = screen.getAllByText('C03 — Near-IR Veggie');
      // One is the dropdown option, the other is the swipe toast
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('vertical swipe does not change band', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect((screen.getByLabelText('Band') as HTMLSelectElement).value).toBe('C02');
    });

    const area = screen.getByTestId('swipe-gesture-area');
    // Vertical swipe (dy > dx)
    fireEvent.touchStart(area, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchEnd(area, { changedTouches: [{ clientX: 210, clientY: 300 }] });

    const bandSelect = screen.getByLabelText('Band') as HTMLSelectElement;
    expect(bandSelect.value).toBe('C02');
  });
});

describe('Countdown Timer', () => {
  it('renders countdown near refresh button', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Refresh now')).toBeInTheDocument();
    });

    // Countdown should be visible as child of the refresh button
    const refreshBtn = screen.getByLabelText('Refresh now');
    // The countdown is rendered as a span inside the button
    const countdown = refreshBtn.querySelector('span');
    expect(countdown).toBeTruthy();
    expect(countdown?.textContent).toMatch(/^Next: \d+:\d{2}$/);
  });

  it('countdown shows M:SS format', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Refresh now')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByLabelText('Refresh now');
    const countdown = refreshBtn.querySelector('span');
    // Default is 5 min (300s) → "Next: 5:00"
    expect(countdown?.textContent).toBe('Next: 5:00');
  });

  it('countdown decrements after 1 second', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Refresh now')).toBeInTheDocument();
    });

    const refreshBtn = screen.getByLabelText('Refresh now');
    const getCountdown = () => refreshBtn.querySelector('span')?.textContent;

    expect(getCountdown()).toBe('Next: 5:00');

    act(() => { vi.advanceTimersByTime(1000); });
    expect(getCountdown()).toBe('Next: 4:59');

    act(() => { vi.advanceTimersByTime(1000); });
    expect(getCountdown()).toBe('Next: 4:58');
  });
});

describe('Status Pill Overlay', () => {
  it('renders satellite, band, and time ago', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-16');
      expect(pill.textContent).toContain('C02');
      // Time ago should be present (e.g., "2 min ago")
      expect(pill.textContent).toMatch(/\d+ min ago|just now/);
    });
  });

  it('shows LIVE label by default', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('LIVE');
    });
  });
});

describe('Cached Image Banner', () => {
  it('banner appears when using cached image', async () => {
    vi.useRealTimers();
    // Store a cached image
    const cachedData = {
      url: 'data:image/png;base64,iVBOR',
      satellite: 'GOES-16',
      band: 'C02',
      sector: 'CONUS',
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('live-last-image-meta', JSON.stringify(cachedData));

    // Make the real image fail so it falls back to cache
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS_DATA });
      if (url.startsWith('/goes/latest')) return Promise.resolve({
        data: {
          ...FRAME_DATA,
          image_url: 'http://broken-url/image.png',
          thumbnail_url: 'http://broken-url/thumb.png',
        },
      });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: null });
      if (url.startsWith('/goes/catalog/available')) return Promise.resolve({ data: { satellite: 'GOES-16', available_sectors: ['CONUS'], checked_at: new Date().toISOString() } });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<LiveTab />);

    // Wait for image to render
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
    });

    // Trigger error on image to fall back to cache
    const img = document.querySelector('img');
    if (img) fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByTestId('cached-image-banner')).toBeInTheDocument();
      expect(screen.getByText(/Cached image/)).toBeInTheDocument();
    });

    localStorage.removeItem('live-last-image-meta');
  });

  it('X button dismisses cached banner', async () => {
    vi.useRealTimers();
    const cachedData = {
      url: 'data:image/png;base64,iVBOR',
      satellite: 'GOES-16',
      band: 'C02',
      sector: 'CONUS',
      timestamp: new Date().toISOString(),
    };
    localStorage.setItem('live-last-image-meta', JSON.stringify(cachedData));

    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS_DATA });
      if (url.startsWith('/goes/latest')) return Promise.resolve({
        data: {
          ...FRAME_DATA,
          image_url: 'http://broken-url/image.png',
          thumbnail_url: 'http://broken-url/thumb.png',
        },
      });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: null });
      if (url.startsWith('/goes/catalog/available')) return Promise.resolve({ data: { satellite: 'GOES-16', available_sectors: ['CONUS'], checked_at: new Date().toISOString() } });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
    });

    const img = document.querySelector('img');
    if (img) fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByTestId('cached-image-banner')).toBeInTheDocument();
    });

    // Click dismiss
    fireEvent.click(screen.getByLabelText('Dismiss cached banner'));

    await waitFor(() => {
      expect(screen.queryByTestId('cached-image-banner')).not.toBeInTheDocument();
    });

    localStorage.removeItem('live-last-image-meta');
  });
});

describe('Controls FAB', () => {
  it('FAB shows "Controls" label', async () => {
    vi.useRealTimers();
    // Mock mobile viewport
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    window.dispatchEvent(new Event('resize'));

    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('mobile-fab')).toBeInTheDocument();
    });

    expect(screen.getByText('Controls')).toBeInTheDocument();

    // Restore
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    window.dispatchEvent(new Event('resize'));
  });

  it('FAB toggle opens and closes menu', async () => {
    vi.useRealTimers();
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    window.dispatchEvent(new Event('resize'));

    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('fab-toggle')).toBeInTheDocument();
    });

    const toggle = screen.getByTestId('fab-toggle');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByTestId('fab-menu')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    window.dispatchEvent(new Event('resize'));
  });

  it('FAB menu shows Watch, Auto-fetch, and Compare options', async () => {
    vi.useRealTimers();
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    window.dispatchEvent(new Event('resize'));

    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('fab-toggle')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('fab-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('fab-menu')).toBeInTheDocument();
    });

    const menu = screen.getByTestId('fab-menu');
    expect(menu.textContent).toContain('Watch');
    expect(menu.textContent).toContain('Auto-fetch');
    expect(menu.textContent).toContain('Compare');

    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    window.dispatchEvent(new Event('resize'));
  });
});

describe('Status Pill Always Visible', () => {
  it('status pill is always visible when data is loaded', async () => {
    vi.useRealTimers();
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('status-pill')).toBeInTheDocument();
    });
  });
});

describe('CdnImage Error Recovery', () => {
  it('shows retry button when image fails and no cache', async () => {
    vi.useRealTimers();
    localStorage.removeItem('live-last-image-meta');

    renderWithProviders(<LiveTab />);

    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
    });

    const img = document.querySelector('img');
    if (img) fireEvent.error(img);

    await waitFor(() => {
      expect(screen.getByText(/Image unavailable · Retrying/)).toBeInTheDocument();
    });
  });
});
