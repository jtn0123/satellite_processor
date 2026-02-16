import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

import CleanupTab from '../components/GoesData/CleanupTab';
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
    if (url === '/goes/cleanup-rules') return Promise.resolve({ data: [] });
    if (url === '/goes/frames/stats') return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} } });
    return Promise.resolve({ data: {} });
  });
});

describe('CleanupTab - Defensive Scenarios', () => {
  it('renders without crashing with empty data', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Cleanup Rules/i).length).toBeGreaterThan(0);
    });
  });

  it('handles cleanup-rules API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/cleanup-rules') return Promise.resolve({ data: null });
      if (url === '/goes/frames/stats') return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles stats API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/cleanup-rules') return Promise.resolve({ data: [] });
      if (url === '/goes/frames/stats') return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles all APIs failing', async () => {
    mockedApi.get.mockRejectedValue(new Error('Network error'));
    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles stats with zero values (no division errors)', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/cleanup-rules') return Promise.resolve({ data: [] });
      if (url === '/goes/frames/stats') return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText(/Storage Usage/i)).toBeInTheDocument();
    });
  });

  it('renders multiple rules', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/cleanup-rules') return Promise.resolve({
        data: [
          { id: '1', name: 'Age Rule', rule_type: 'max_age_days', value: 30, protect_collections: true, is_active: true, created_at: '2024-06-01' },
          { id: '2', name: 'Size Rule', rule_type: 'max_storage_gb', value: 100, protect_collections: false, is_active: false, created_at: '2024-06-01' },
        ],
      });
      if (url === '/goes/frames/stats') return Promise.resolve({ data: { total_frames: 500, total_size_bytes: 50_000_000, by_satellite: {}, by_band: {} } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('Age Rule')).toBeInTheDocument();
      expect(screen.getByText('Size Rule')).toBeInTheDocument();
    });
  });
});
