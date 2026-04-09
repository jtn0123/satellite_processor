import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

import StatsTab from '../components/GoesData/StatsTab';

const server = setupMswServer();

describe('StatsTab', () => {
  it('renders loading state', () => {
    server.use(
      http.get('*/api/satellite/frames/stats', async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<StatsTab />);
    expect(screen.getByText('Loading stats...')).toBeInTheDocument();
  });

  it('renders error state when API fails', async () => {
    server.use(http.get('*/api/satellite/frames/stats', () => HttpResponse.error()));
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed to load statistics.')).toBeInTheDocument();
    });
  });

  it('renders with full stats data', async () => {
    server.use(
      http.get('*/api/satellite/frames/stats', () =>
        HttpResponse.json({
          total_frames: 1234,
          total_size_bytes: 5_000_000,
          by_satellite: {
            'GOES-16': { count: 800, size: 3_000_000 },
            'GOES-18': { count: 434, size: 2_000_000 },
          },
          by_band: {
            C02: { count: 500, size: 2_000_000 },
            C13: { count: 734, size: 3_000_000 },
          },
        }),
      ),
    );
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
    // Default handlers serve empty stats already.
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('No statistics yet')).toBeInTheDocument();
    });
  });

  it('handles stats with null by_satellite and by_band (defensive)', async () => {
    server.use(
      http.get('*/api/satellite/frames/stats', () =>
        HttpResponse.json({
          total_frames: 10,
          total_size_bytes: 1024,
          by_satellite: null,
          by_band: null,
        }),
      ),
    );
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('10')).toBeInTheDocument();
      // Should show 0 satellites since by_satellite is null
      expect(screen.getAllByText('0').length).toBeGreaterThan(0);
    });
  });

  it('handles stats with undefined by_satellite and by_band (defensive)', async () => {
    server.use(
      http.get('*/api/satellite/frames/stats', () =>
        HttpResponse.json({
          total_frames: 5,
          total_size_bytes: 512,
        }),
      ),
    );
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('5')).toBeInTheDocument();
    });
  });

  it('renders nothing when stats is null/undefined', async () => {
    server.use(http.get('*/api/satellite/frames/stats', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<StatsTab />);
    await waitFor(() => {
      // Component returns null when !stats
      expect(container.innerHTML).toBe('');
    });
  });

  it('handles single satellite with zero size (division edge case)', async () => {
    server.use(
      http.get('*/api/satellite/frames/stats', () =>
        HttpResponse.json({
          total_frames: 1,
          total_size_bytes: 0,
          by_satellite: { 'GOES-16': { count: 1, size: 0 } },
          by_band: { C02: { count: 1, size: 0 } },
        }),
      ),
    );
    renderWithProviders(<StatsTab />);
    await waitFor(() => {
      expect(screen.getByText('GOES-16')).toBeInTheDocument();
      expect(screen.getByText('C02')).toBeInTheDocument();
    });
  });
});
