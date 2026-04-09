import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import PresetsTab from '../components/GoesData/PresetsTab';

const server = setupMswServer();

describe('PresetsTab - Defensive Scenarios', () => {
  it('handles presets API returning null', async () => {
    server.use(http.get('*/api/satellite/fetch-presets', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles schedules API returning null', async () => {
    server.use(http.get('*/api/satellite/schedules', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles all APIs failing', async () => {
    server.use(
      http.get('*/api/satellite/fetch-presets', () => HttpResponse.error()),
      http.get('*/api/satellite/schedules', () => HttpResponse.error()),
    );
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles presets API returning paginated object', async () => {
    server.use(
      http.get('*/api/satellite/fetch-presets', () =>
        HttpResponse.json({
          items: [
            {
              id: '1',
              name: 'Test Preset',
              satellite: 'GOES-16',
              sector: 'CONUS',
              band: 'C02',
              description: '',
              created_at: '2024-01-01',
            },
          ],
          total: 1,
        }),
      ),
    );
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles schedule with null preset reference', async () => {
    server.use(
      http.get('*/api/satellite/fetch-presets', () =>
        HttpResponse.json([
          {
            id: '1',
            name: 'P1',
            satellite: 'GOES-16',
            sector: 'CONUS',
            band: 'C02',
            description: '',
            created_at: '2024-01-01',
          },
        ]),
      ),
      http.get('*/api/satellite/schedules', () =>
        HttpResponse.json([
          {
            id: 's1',
            name: 'Hourly',
            preset_id: '1',
            interval_minutes: 60,
            is_active: true,
            last_run_at: null,
            next_run_at: null,
            preset: null,
          },
        ]),
      ),
    );
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('renders empty presets and schedules', async () => {
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Fetch Presets/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Schedules/i).length).toBeGreaterThan(0);
    });
  });
});
