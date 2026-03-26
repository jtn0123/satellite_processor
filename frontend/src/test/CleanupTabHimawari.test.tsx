import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from './testUtils';

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

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const mockStats = {
  total_frames: 1200,
  total_size_bytes: 5_368_709_120,
  by_satellite: {
    'GOES-16': { count: 500, size: 2_000_000_000 },
    'Himawari-9': { count: 700, size: 3_368_709_120 },
  },
  by_band: {
    C02: { count: 500, size: 2_000_000_000 },
    B13: { count: 700, size: 3_368_709_120 },
  },
};

const mockStorageStats = {
  total_frames: 1200,
  total_size: 5_368_709_120,
  satellites: {
    'GOES-16': {
      total_frames: 500,
      total_size: 2_000_000_000,
      sectors: {
        CONUS: {
          count: 300,
          size: 1_200_000_000,
          oldest: '2024-03-01T00:00:00',
          newest: '2024-03-15T00:00:00',
        },
        'Full Disk': {
          count: 200,
          size: 800_000_000,
          oldest: '2024-03-01T00:00:00',
          newest: '2024-03-15T00:00:00',
        },
      },
    },
    'Himawari-9': {
      total_frames: 700,
      total_size: 3_368_709_120,
      sectors: {
        FLDK: {
          count: 500,
          size: 2_500_000_000,
          oldest: '2024-03-01T00:00:00',
          newest: '2024-03-15T00:00:00',
        },
        Japan: {
          count: 200,
          size: 868_709_120,
          oldest: '2024-03-10T00:00:00',
          newest: '2024-03-15T00:00:00',
        },
      },
    },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/satellite/cleanup-rules') return Promise.resolve({ data: [] });
    if (url === '/satellite/frames/stats') return Promise.resolve({ data: mockStats });
    if (url === '/satellite/cleanup/stats') return Promise.resolve({ data: mockStorageStats });
    if (url === '/satellite/cleanup/preview') {
      return Promise.resolve({ data: { frame_count: 0, total_size_bytes: 0, frames: [] } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('CleanupTab - Himawari Storage Display', () => {
  it('renders per-satellite storage breakdown section', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('Storage by Satellite')).toBeInTheDocument();
    });
  });

  it('shows Himawari-9 satellite card', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getAllByText('Himawari-9').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows GOES-16 satellite card', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getAllByText('GOES-16').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows sector breakdown for Himawari', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('FLDK')).toBeInTheDocument();
      expect(screen.getByText('Japan')).toBeInTheDocument();
    });
  });

  it('shows CONUS sector for GOES', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('CONUS')).toBeInTheDocument();
    });
  });

  it('displays total frame count', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('1200')).toBeInTheDocument();
    });
  });
});

describe('CleanupTab - Satellite Filter in Rule Creation', () => {
  it('shows satellite filter dropdown in create form', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('New Rule')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Rule'));
    expect(screen.getByLabelText('Satellite filter')).toBeInTheDocument();
  });

  it('satellite dropdown has Himawari-9 option', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => expect(screen.getByText('New Rule')).toBeInTheDocument());

    fireEvent.click(screen.getByText('New Rule'));
    const select = screen.getByLabelText('Satellite filter') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('Himawari-9');
    expect(options).toContain('GOES-16');
    expect(options).toContain(''); // "All Satellites" option
  });

  it('shows satellite badge on rules with satellite filter', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/cleanup-rules') {
        return Promise.resolve({
          data: [
            {
              id: '1',
              name: 'Himawari Prune',
              rule_type: 'max_age_days',
              value: 7,
              satellite: 'Himawari-9',
              protect_collections: true,
              is_active: true,
              created_at: '2024-06-01',
            },
            {
              id: '2',
              name: 'Global Prune',
              rule_type: 'max_age_days',
              value: 30,
              satellite: null,
              protect_collections: true,
              is_active: true,
              created_at: '2024-06-01',
            },
          ],
        });
      }
      if (url === '/satellite/frames/stats') return Promise.resolve({ data: mockStats });
      if (url === '/satellite/cleanup/stats') return Promise.resolve({ data: mockStorageStats });
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('Himawari Prune')).toBeInTheDocument();
      expect(screen.getAllByText('Himawari-9').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('all satellites')).toBeInTheDocument();
    });
  });
});

describe('CleanupTab - Empty Storage Stats', () => {
  it('does not show satellite breakdown when no data', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/cleanup-rules') return Promise.resolve({ data: [] });
      if (url === '/satellite/frames/stats') {
        return Promise.resolve({
          data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} },
        });
      }
      if (url === '/satellite/cleanup/stats') {
        return Promise.resolve({ data: { total_frames: 0, total_size: 0, satellites: {} } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('Storage Usage')).toBeInTheDocument();
    });
    // Should not show "Storage by Satellite" when empty
    expect(screen.queryByText('Storage by Satellite')).not.toBeInTheDocument();
  });

  it('handles null storageStats gracefully', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/cleanup-rules') return Promise.resolve({ data: [] });
      if (url === '/satellite/frames/stats') {
        return Promise.resolve({
          data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} },
        });
      }
      if (url === '/satellite/cleanup/stats') return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });

    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
