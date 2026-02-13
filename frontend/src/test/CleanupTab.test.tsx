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

import CleanupTab from '../components/GoesData/CleanupTab';
import api from '../api/client';

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
    if (url === '/goes/cleanup-rules') return Promise.resolve({ data: [] });
    if (url === '/goes/frames/stats') {
      return Promise.resolve({
        data: { total_frames: 100, total_size_bytes: 1024000, by_satellite: {}, by_band: {} },
      });
    }
    if (url === '/goes/cleanup/preview') {
      return Promise.resolve({ data: { frame_count: 0, total_size_bytes: 0, frames: [] } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('CleanupTab', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Cleanup Rules/i).length).toBeGreaterThan(0);
    });
  });

  it('shows storage usage section', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText(/Storage Usage/i)).toBeInTheDocument();
    });
  });

  it('renders rules list when data exists', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/cleanup-rules') {
        return Promise.resolve({
          data: [{
            id: '1', name: 'Age Rule', rule_type: 'max_age_days', value: 30,
            protect_collections: true, is_active: true, created_at: '2024-06-01',
          }],
        });
      }
      if (url === '/goes/frames/stats') {
        return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} } });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('Age Rule')).toBeInTheDocument();
    });
  });

  it('shows preview button', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      const previewBtn = screen.getByText(/Preview/i);
      expect(previewBtn).toBeInTheDocument();
    });
  });
});
