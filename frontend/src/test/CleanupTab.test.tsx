import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

import CleanupTab from '../components/GoesData/CleanupTab';

const server = setupMswServer();

beforeEach(() => {
  // Most tests in this file expect non-zero stats.
  server.use(
    http.get('*/api/satellite/frames/stats', () =>
      HttpResponse.json({
        total_frames: 100,
        total_size_bytes: 1024000,
        by_satellite: {},
        by_band: {},
      }),
    ),
  );
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
        ]),
      ),
    );
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
