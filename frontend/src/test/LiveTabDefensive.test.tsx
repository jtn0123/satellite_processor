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
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}>{ui}</QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }], bands: [{ id: 'C02', description: 'Red' }] } });
    if (url.startsWith('/goes/latest')) return Promise.resolve({ data: { id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', capture_time: '2024-06-01T12:00:00', file_path: '/tmp/test.nc', file_size: 1024, width: 5424, height: 3000, thumbnail_path: null } });
    return Promise.resolve({ data: {} });
  });
});

describe('LiveTab - Defensive Scenarios', () => {
  it('handles products API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: null });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles products with empty arrays', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], sectors: [], bands: [] } });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('handles latest frame API returning null (no crash)', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }], bands: [{ id: 'C02', description: 'Red' }] } });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<LiveTab />);
    await waitFor(() => {
      // Should render without crashing even when frame data is null
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles latest frame API error', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }], bands: [{ id: 'C02', description: 'Red' }] } });
      if (url.startsWith('/goes/latest')) return Promise.reject(new Error('Not found'));
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(screen.getByText(/No local frames available/i)).toBeInTheDocument();
    });
  });

  it('handles all APIs failing', async () => {
    mockedApi.get.mockRejectedValue(new Error('Network error'));
    const { container } = renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles frame with null dimensions', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }], bands: [{ id: 'C02', description: 'Red' }] } });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: { id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', capture_time: '2024-06-01T12:00:00', file_path: '/tmp/test.nc', file_size: 0, width: null, height: null, thumbnail_path: null } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles products with missing fields', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: {} });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<LiveTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
