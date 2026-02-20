import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
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
  return render(<MemoryRouter><QueryClientProvider client={qc}>{ui}</QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') {
      return Promise.resolve({
        data: {
          satellites: ['GOES-16', 'GOES-18'],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }],
          bands: [{ id: 'C02', description: 'Red' }, { id: 'C13', description: 'IR' }],
        },
      });
    }
    if (url.startsWith('/goes/latest')) {
      return Promise.resolve({
        data: {
          id: 'f1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02',
          capture_time: '2024-06-01T12:00:00', file_path: '/tmp/t.nc',
          file_size: 1024, width: 5424, height: 3000, thumbnail_path: '/tmp/th.png', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('LiveTab extended', () => {
  it('renders loading state initially', () => {
    // Make the query take forever
    mockedApi.get.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<LiveTab />);
    // Should show loading or at minimum the controls
    expect(document.body.textContent).toBeTruthy();
  });

  it('renders image when frame data available', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
    });
  });

  it('has four control sections', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Satellite')).toBeInTheDocument();
      expect(screen.getByLabelText('Sector')).toBeInTheDocument();
      expect(screen.getByLabelText('Band')).toBeInTheDocument();
      expect(screen.getByLabelText('Auto-refresh interval')).toBeInTheDocument();
    });
  });

  it('renders refresh interval options', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const selects = document.querySelectorAll('select');
      // Should have satellite, sector, band, and refresh interval selects
      expect(selects.length).toBe(4);
    });
  });

  it('shows green pulse indicator', async () => {
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      const pulse = document.querySelector('.animate-pulse');
      expect(pulse).toBeTruthy();
    });
  });
});
