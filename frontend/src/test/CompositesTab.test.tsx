import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

import CompositesTab from '../components/GoesData/CompositesTab';

const server = setupMswServer();

beforeEach(() => {
  server.use(
    http.get('*/api/satellite/products', () =>
      HttpResponse.json({
        satellites: ['GOES-16'],
        sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }],
        bands: [{ id: 'C02', description: 'Red' }],
      }),
    ),
    http.get('*/api/satellite/composite-recipes', () =>
      HttpResponse.json([
        { id: 'true_color', name: 'True Color', bands: ['C02', 'C03', 'C01'] },
        { id: 'fire_detection', name: 'Fire Detection', bands: ['C07', 'C06', 'C02'] },
      ]),
    ),
  );
});

describe('CompositesTab', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Composite/i).length).toBeGreaterThan(0);
    });
  });

  it('shows recipe options', async () => {
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Fire Detection/i).length).toBeGreaterThan(0);
    });
  });

  it('renders generate button', async () => {
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it('shows composites when data exists', async () => {
    server.use(
      http.get('*/api/satellite/composite-recipes', () =>
        HttpResponse.json([{ id: 'true_color', name: 'True Color', bands: ['C02'] }]),
      ),
      http.get('*/api/satellite/composites', () =>
        HttpResponse.json({
          items: [
            {
              id: '1',
              name: 'True Color',
              recipe: 'true_color',
              satellite: 'GOES-16',
              sector: 'CONUS',
              capture_time: '2024-06-01T12:00:00',
              file_path: null,
              file_size: 0,
              status: 'completed',
              error: '',
              created_at: '2024-06-01T12:05:00',
            },
          ],
          total: 1,
          page: 1,
          limit: 20,
        }),
      ),
    );
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
    });
  });
});
