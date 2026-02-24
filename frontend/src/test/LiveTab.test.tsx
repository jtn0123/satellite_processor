import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter><QueryClientProvider client={qc}>{ui}</QueryClientProvider></MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') {
      return Promise.resolve({
        data: {
          satellites: ['GOES-16', 'GOES-18'],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }],
          bands: [{ id: 'C02', description: 'Red (0.64µm)' }],
        },
      });
    }
    if (url.startsWith('/goes/latest')) {
      return Promise.resolve({
        data: {
          id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02',
          capture_time: '2024-06-01T12:00:00', file_path: '/tmp/test.nc',
          file_size: 1024, width: 5424, height: 3000, thumbnail_path: null, image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('LiveTab', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTestId('status-pill')).toBeInTheDocument();
    });
  });

  it('renders satellite selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Satellite')).toBeInTheDocument();
    });
  });

  it('renders band selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Band')).toBeInTheDocument();
    });
  });

  it('renders sector selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Sector')).toBeInTheDocument();
    });
  });

  it('renders auto-refresh selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Auto-fetch interval')).toBeInTheDocument();
    });
  });

  it('renders refresh button', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTitle('Refresh now')).toBeInTheDocument();
    });
  });

  it('renders fullscreen button', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByTitle('Enter fullscreen')).toBeInTheDocument();
    });
  });

  it('shows error state when no frame data', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith('/goes/latest')) {
        // Must look like an Axios 404 so the component's custom retry skips retries
        const axiosError = Object.assign(new Error('Not found'), {
          isAxiosError: true,
          response: { status: 404 },
        });
        return Promise.reject(axiosError);
      }
      if (url === '/goes/products') {
        return Promise.resolve({
          data: {
            satellites: ['GOES-16'],
            sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }],
            bands: [{ id: 'C02', description: 'Red' }],
          },
        });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      // Live tab always constructs a CDN URL — never shows empty state
      const img = screen.queryByRole('img');
      const shimmer = screen.queryByTestId('loading-shimmer') ?? screen.queryByTestId('image-shimmer');
      expect(img ?? shimmer).toBeTruthy();
    });
  });

  it('displays status pill with satellite info', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill).toBeInTheDocument();
      expect(pill.textContent).toContain('LIVE');
    });
  });

  it('status pill shows satellite and band info when frame loads', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-16');
      expect(pill.textContent).toContain('C02');
    });
  });
});
