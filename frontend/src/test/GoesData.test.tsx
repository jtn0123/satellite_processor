import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// Mock axios-based api client
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import GoesData from '../pages/GoesData';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/goes']}>
        <Routes>
          <Route path="/goes" element={ui} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default mock responses
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
    if (url === '/goes/frames') {
      return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
    }
    if (url === '/goes/frames/stats') {
      return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} } });
    }
    if (url === '/goes/collections') {
      return Promise.resolve({ data: [] });
    }
    if (url === '/goes/tags') {
      return Promise.resolve({ data: [] });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('GoesData page', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<GoesData />);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'GOES Data' })).toBeInTheDocument();
    });
  });

  it('renders tab navigation', async () => {
    renderWithProviders(<GoesData />);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Browse/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Fetch/i })).toBeInTheDocument();
    });
  });

  it('shows overview tab by default', async () => {
    renderWithProviders(<GoesData />);
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Overview/i })).toHaveAttribute('aria-selected', 'true');
    });
  });
});
