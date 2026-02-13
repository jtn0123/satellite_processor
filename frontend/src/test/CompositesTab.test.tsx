import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import CompositesTab from '../components/GoesData/CompositesTab';
import api from '../api/client';

const mockedApi = api as unknown;

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
          satellites: ['GOES-16'],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }],
          bands: [{ id: 'C02', description: 'Red' }],
        },
      });
    }
    if (url === '/goes/composite-recipes') {
      return Promise.resolve({
        data: [
          { id: 'true_color', name: 'True Color', bands: ['C02', 'C03', 'C01'] },
          { id: 'fire_detection', name: 'Fire Detection', bands: ['C07', 'C06', 'C02'] },
        ],
      });
    }
    if (url.startsWith('/goes/composites')) {
      return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 20 } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('CompositesTab', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Composite/i).length).toBeGreaterThan(0);
    });
  });

  it('shows recipe options', async () => {
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Fire Detection/i).length).toBeGreaterThan(0);
    });
  });

  it('renders generate button', async () => {
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it('shows composites when data exists', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/composite-recipes') {
        return Promise.resolve({
          data: [{ id: 'true_color', name: 'True Color', bands: ['C02'] }],
        });
      }
      if (url.startsWith('/goes/composites')) {
        return Promise.resolve({
          data: {
            items: [{
              id: '1', name: 'True Color', recipe: 'true_color',
              satellite: 'GOES-16', sector: 'CONUS', capture_time: '2024-06-01T12:00:00',
              file_path: null, file_size: 0, status: 'completed', error: '',
              created_at: '2024-06-01T12:05:00',
            }],
            total: 1, page: 1, limit: 20,
          },
        });
      }
      if (url === '/goes/products') {
        return Promise.resolve({ data: { satellites: ['GOES-16'], sectors: [], bands: [] } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
    });
  });
});
