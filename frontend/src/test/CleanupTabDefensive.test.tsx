import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import CleanupTab from '../components/GoesData/CleanupTab';

const server = setupMswServer();

describe('CleanupTab - Defensive Scenarios', () => {
  it('renders without crashing with empty data', async () => {
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Cleanup Rules/i).length).toBeGreaterThan(0);
    });
  });

  it('handles cleanup-rules API returning null', async () => {
    server.use(http.get('*/api/satellite/cleanup-rules', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles stats API returning null', async () => {
    server.use(http.get('*/api/satellite/frames/stats', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles all APIs failing', async () => {
    server.use(
      http.get('*/api/satellite/cleanup-rules', () => HttpResponse.error()),
      http.get('*/api/satellite/frames/stats', () => HttpResponse.error()),
      http.get('*/api/satellite/cleanup/stats', () => HttpResponse.error()),
    );
    const { container } = renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles stats with zero values (no division errors)', async () => {
    // Default handlers already return zero-valued stats — no overrides needed.
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText(/Storage Usage/i)).toBeInTheDocument();
    });
  });

  it('renders multiple rules', async () => {
    server.use(
      http.get('*/api/satellite/cleanup-rules', () =>
        HttpResponse.json([
          {
            id: '1',
            name: 'Age Rule',
            rule_type: 'max_age_days',
            value: 30,
            protect_collections: true,
            is_active: true,
            created_at: '2024-06-01',
          },
          {
            id: '2',
            name: 'Size Rule',
            rule_type: 'max_storage_gb',
            value: 100,
            protect_collections: false,
            is_active: false,
            created_at: '2024-06-01',
          },
        ]),
      ),
      http.get('*/api/satellite/frames/stats', () =>
        HttpResponse.json({
          total_frames: 500,
          total_size_bytes: 50_000_000,
          by_satellite: {},
          by_band: {},
        }),
      ),
    );
    renderWithProviders(<CleanupTab />);
    await waitFor(() => {
      expect(screen.getByText('Age Rule')).toBeInTheDocument();
      expect(screen.getByText('Size Rule')).toBeInTheDocument();
    });
  });
});
