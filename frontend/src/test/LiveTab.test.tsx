import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
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
          file_size: 1024, width: 5424, height: 3000, thumbnail_path: null,
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
      expect(screen.getByText('Live View')).toBeInTheDocument();
    });
  });

  it('renders satellite selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByText('Satellite')).toBeInTheDocument();
    });
  });

  it('renders band selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByText('Band')).toBeInTheDocument();
    });
  });

  it('renders sector selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByText('Sector')).toBeInTheDocument();
    });
  });

  it('renders auto-refresh selector', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByText('Auto-refresh')).toBeInTheDocument();
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
      expect(screen.getByTitle('Fullscreen')).toBeInTheDocument();
    });
  });

  it('shows error state when no frame data', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.startsWith('/goes/latest')) {
        return Promise.reject(new Error('Not found'));
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
      expect(screen.getByText(/No frames available/i)).toBeInTheDocument();
    });
  });

  it('displays frame capture time', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      // The component displays the date from the frame
      const timeText = screen.getAllByText(/2024/);
      expect(timeText.length).toBeGreaterThan(0);
    });
  });
});
