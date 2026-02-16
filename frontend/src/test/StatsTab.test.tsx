import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import StatsTab from '../components/GoesData/StatsTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('StatsTab', () => {
  it('renders loading state', () => {
    // Never resolve so it stays loading
    mockedApi.get.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<StatsTab />);
    expect(screen.getByText('Loading stats...')).toBeInTheDocument();
  });

  it('renders error state when API fails', async () => {
    mockedApi.get.mockRejectedValue(new Error('Network error'));
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load statistics.')).toBeInTheDocument();
    });
  });

  it('renders with full stats data', async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        total_frames: 1234,
        total_size_bytes: 5_000_000,
        by_satellite: { 'GOES-16': { count: 800, size: 3_000_000 }, 'GOES-18': { count: 434, size: 2_000_000 } },
        by_band: { C02: { count: 500, size: 2_000_000 }, C13: { count: 734, size: 3_000_000 } },
      },
    });
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('1,234')).toBeInTheDocument();
      expect(screen.getByText('Total Frames')).toBeInTheDocument();
      expect(screen.getByText('GOES-16')).toBeInTheDocument();
      expect(screen.getByText('GOES-18')).toBeInTheDocument();
      expect(screen.getByText('C02')).toBeInTheDocument();
      expect(screen.getByText('C13')).toBeInTheDocument();
    });
  });

  it('handles stats with empty by_satellite and by_band', async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        total_frames: 0,
        total_size_bytes: 0,
        by_satellite: {},
        by_band: {},
      },
    });
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
      expect(screen.getByText('Total Frames')).toBeInTheDocument();
      expect(screen.getByText('Satellites')).toBeInTheDocument();
    });
  });

  it('handles stats with null by_satellite and by_band (defensive)', async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        total_frames: 10,
        total_size_bytes: 1024,
        by_satellite: null,
        by_band: null,
      },
    });
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      // Should show 0 satellites since by_satellite is null
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });
  });

  it('handles stats with undefined by_satellite and by_band (defensive)', async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        total_frames: 5,
        total_size_bytes: 512,
      },
    });
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('renders nothing when stats is null/undefined', async () => {
    mockedApi.get.mockResolvedValue({ data: null });
    const { container } = renderWithProviders(<StatsTab />);
    await waitFor(() => {
      // Component returns null when !stats
      expect(container.innerHTML).toBe('');
    });
  });

  it('handles single satellite with zero size (division edge case)', async () => {
    mockedApi.get.mockResolvedValue({
      data: {
        total_frames: 1,
        total_size_bytes: 0,
        by_satellite: { 'GOES-16': { count: 1, size: 0 } },
        by_band: { C02: { count: 1, size: 0 } },
      },
    });
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('GOES-16')).toBeInTheDocument();
      expect(screen.getByText('C02')).toBeInTheDocument();
    });
  });
});
