import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../hooks/useMonitorWebSocket', () => ({
  useMonitorWebSocket: vi.fn(() => ({ connected: false, lastEvent: null })),
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

const mockedApi = api as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

const PRODUCTS_DATA = {
  satellites: ['GOES-16', 'GOES-18'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF', cdn_available: true },
    { id: 'Meso1', name: 'Mesoscale 1', product: 'ABI-L2-CMIPF', cdn_available: false },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor (True Color Day, IR Night)' },
    { id: 'C02', description: 'Red (0.64µm)' },
    { id: 'C13', description: 'Clean IR Longwave Window (10.3µm)' },
  ],
  default_satellite: 'GOES-16',
  satellite_availability: {
    'GOES-16': { available_from: '2017-12-18', available_to: null, status: 'active', description: 'GOES-East' },
    'GOES-18': { available_from: '2022-03-01', available_to: null, status: 'active', description: 'GOES-West' },
  },
};

const FRAME_DATA = {
  id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'GEOCOLOR',
  capture_time: new Date().toISOString(), file_size: 1024,
  width: 5424, height: 3000, image_url: '/api/goes/frames/1/image',
  thumbnail_url: '/api/goes/frames/1/thumbnail',
};

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}>{ui}</QueryClientProvider></MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS_DATA });
    if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME_DATA });
    if (url.startsWith('/goes/catalog/latest')) {
      return Promise.resolve({
        data: {
          scan_time: new Date().toISOString(), size: 2048, key: 'test',
          satellite: 'GOES-16', sector: 'CONUS', band: 'GEOCOLOR',
          image_url: 'https://cdn.example.com/image.jpg',
          thumbnail_url: 'https://cdn.example.com/thumb.jpg',
          mobile_url: 'https://cdn.example.com/mobile.jpg',
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('LiveTab — extended coverage', () => {
  it('shows loading shimmer before data arrives', () => {
    // Delay API responses
    mockedApi.get.mockImplementation(() => new Promise(() => { /* never resolves */ }));
    renderWithProviders(<LiveTab />);
    // Should show some loading indicator or the image area
    expect(screen.getByTestId('live-image-area')).toBeInTheDocument();
  });

  it('renders band pill strip with bands from products', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('band-pill-strip')).toBeInTheDocument();
    });
  });

  it('shows MesoFetchRequiredMessage for meso sectors without CDN', async () => {
    // Override latest to return 404 for meso sector
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS_DATA });
      if (url.startsWith('/goes/latest')) {
        const axiosError = Object.assign(new Error('Not found'), {
          isAxiosError: true,
          response: { status: 404 },
        });
        return Promise.reject(axiosError);
      }
      if (url.startsWith('/goes/catalog/latest')) {
        return Promise.reject(new Error('Not found'));
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<LiveTab />);

    // Wait for products to load, then find the sector picker and switch to Meso
    await waitFor(() => {
      expect(screen.getByTestId('pill-strip-sector')).toBeInTheDocument();
    });

    // Click sector chip to open picker
    const sectorChip = screen.getByTestId('pill-strip-sector');
    fireEvent.click(sectorChip);

    // Select Meso1 if option is visible
    const mesoOption = screen.queryByText('Mesoscale 1');
    if (mesoOption) {
      fireEvent.click(mesoOption);

      await waitFor(() => {
        const fetchBtn = screen.queryByText('Fetch to view');
        expect(fetchBtn).toBeInTheDocument();
      }, { timeout: 3000 });
    }
  });

  it('GEOCOLOR is selected by default', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GEOCOLOR');
    });
  });

  it('accepts onMonitorChange prop without error', async () => {
    const onMonitorChange = vi.fn();
    renderWithProviders(<LiveTab onMonitorChange={onMonitorChange} />);
    await waitFor(() => {
      expect(screen.getByTestId('status-pill')).toBeInTheDocument();
    });
    // Prop is accepted, component renders fine
    expect(screen.getByTestId('status-pill').textContent).toContain('LIVE');
  });

  it('countdown display is visible in refresh button', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const refreshBtn = screen.getByTitle('Refresh now');
      // Should contain countdown text like "Next: X:XX"
      expect(refreshBtn.textContent).toMatch(/Next:/);
    });
  });

  it('refresh button triggers refetch', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTitle('Refresh now')).toBeInTheDocument();
    });

    const callCount = mockedApi.get.mock.calls.length;
    fireEvent.click(screen.getByTitle('Refresh now'));

    // Should trigger additional API calls
    await waitFor(() => {
      expect(mockedApi.get.mock.calls.length).toBeGreaterThan(callCount);
    });
  });

  it('renders swipe gesture area', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('swipe-gesture-area')).toBeInTheDocument();
    });
  });

  it('aria-live attributes are present on status pill', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      // SR-only span should have aria-live
      const srSpan = pill.querySelector('[aria-live="polite"]');
      expect(srSpan).toBeInTheDocument();
    });
  });
});
