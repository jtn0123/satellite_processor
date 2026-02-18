import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../hooks/useDebounce', () => ({ useDebounce: (val: string) => val }));

import BrowseTab from '../components/GoesData/BrowseTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

// Mock IntersectionObserver
beforeEach(() => {
  const mockObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    disconnect: vi.fn(),
    unobserve: vi.fn(),
  }));
  vi.stubGlobal('IntersectionObserver', mockObserver);
});

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

function setupDefaultMocks() {
  mockedApi.get.mockImplementation((url: string) => {
    if (url.includes('/goes/frames')) {
      return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
    }
    if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
    if (url === '/goes/tags') return Promise.resolve({ data: [] });
    if (url === '/goes/collections') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setupDefaultMocks();
});

describe('BrowseTab - Defensive Scenarios', () => {
  it('handles frames API returning raw array instead of paginated object', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: [] });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles frames API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: null });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles products API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
      if (url === '/goes/products') return Promise.resolve({ data: null });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles tags API returning paginated object instead of array', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/tags') return Promise.resolve({ data: { items: [{ id: '1', name: 'test', color: '#ff0000' }], total: 1 } });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles collections API returning paginated object instead of array', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: { items: [{ id: '1', name: 'My Col', frame_count: 5 }], total: 1 } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when frames total is 0', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText(/No frames yet/i)).toBeInTheDocument();
    });
  });

  it('shows 0 frames count text', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText(/0 frames/)).toBeInTheDocument();
    });
  });

  it('shows skeleton loading cards while fetching', () => {
    mockedApi.get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<BrowseTab />);
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  it('renders frames when data exists', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) {
        return Promise.resolve({
          data: {
            items: [
              { id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', capture_time: '2024-06-01T12:00:00', file_path: '/tmp/test.nc', file_size: 1024, width: 5424, height: 3000, thumbnail_path: null, tags: [], collections: [] },
            ],
            total: 1, page: 1, limit: 50,
          },
        });
      }
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-16'], bands: [{ id: 'C02', description: 'Red' }], sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      const body = document.body.textContent ?? '';
      expect(body).toContain('1 frame');
    });
  });

  it('does not show pagination - uses infinite scroll instead', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Next page')).not.toBeInTheDocument();
    });
  });

  it('switches between grid and list view', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
      expect(screen.getByLabelText('List view')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('List view'));
    fireEvent.click(screen.getByLabelText('Grid view'));
  });

  it('handles all APIs failing simultaneously', async () => {
    mockedApi.get.mockRejectedValue(new Error('Server down'));
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles frames with null width/height/thumbnail', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) {
        return Promise.resolve({
          data: {
            items: [{ id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', capture_time: '2024-06-01T12:00:00', file_path: '/tmp/test.nc', file_size: 0, width: null, height: null, thumbnail_path: null, tags: [], collections: [] }],
            total: 1, page: 1, limit: 50,
          },
        });
      }
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('select all works with empty frames', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      const selectBtn = screen.getByText(/Select All/i);
      fireEvent.click(selectBtn);
      expect(selectBtn).toBeTruthy();
    });
  });

  it('handles framesData.limit being 0', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) {
        return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 0 } });
      }
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
