import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import CompositesTab from '../components/GoesData/CompositesTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }], bands: [{ id: 'C02', description: 'Red' }] } });
    if (url === '/goes/composite-recipes') return Promise.resolve({ data: [{ id: 'true_color', name: 'True Color', bands: ['C02', 'C03', 'C01'] }] });
    if (url.startsWith('/goes/composites')) return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 20 } });
    return Promise.resolve({ data: {} });
  });
});

describe('CompositesTab - Defensive Scenarios', () => {
  it('handles recipes API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/composite-recipes') return Promise.resolve({ data: null });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], sectors: [], bands: [] } });
      if (url.startsWith('/goes/composites')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles composites API returning null items', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/composite-recipes') return Promise.resolve({ data: [] });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], sectors: [], bands: [] } });
      if (url.startsWith('/goes/composites')) return Promise.resolve({ data: { items: null, total: 0 } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles products API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: null });
      if (url === '/goes/composite-recipes') return Promise.resolve({ data: [] });
      if (url.startsWith('/goes/composites')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles all APIs failing', async () => {
    mockedApi.get.mockRejectedValue(new Error('Server error'));
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('renders composites with various statuses', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/composite-recipes') return Promise.resolve({ data: [{ id: 'true_color', name: 'True Color', bands: ['C02'] }] });
      if (url.startsWith('/goes/composites')) return Promise.resolve({
        data: {
          items: [
            { id: '1', name: 'True Color', recipe: 'true_color', satellite: 'GOES-16', sector: 'CONUS', capture_time: '2024-06-01T12:00:00', file_path: '/tmp/c.png', file_size: 1024, status: 'completed', error: '', created_at: '2024-06-01' },
            { id: '2', name: 'True Color', recipe: 'true_color', satellite: 'GOES-16', sector: 'CONUS', capture_time: '2024-06-01T13:00:00', file_path: null, file_size: 0, status: 'failed', error: 'Missing bands', created_at: '2024-06-01' },
            { id: '3', name: 'True Color', recipe: 'true_color', satellite: 'GOES-16', sector: 'CONUS', capture_time: '2024-06-01T14:00:00', file_path: null, file_size: 0, status: 'pending', error: '', created_at: '2024-06-01' },
          ],
          total: 3, page: 1, limit: 20,
        },
      });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [], bands: [] } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
    });
  });

  it('handles empty recipes list', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/composite-recipes') return Promise.resolve({ data: [] });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], sectors: [], bands: [] } });
      if (url.startsWith('/goes/composites')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
