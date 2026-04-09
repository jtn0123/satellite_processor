import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import CompositesTab from '../components/GoesData/CompositesTab';

const server = setupMswServer();

describe('CompositesTab - Defensive Scenarios', () => {
  it('handles recipes API returning null', async () => {
    server.use(http.get('*/api/satellite/composite-recipes', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles composites API returning null items', async () => {
    server.use(
      http.get('*/api/satellite/composites', () =>
        HttpResponse.json({ items: null, total: 0 }),
      ),
    );
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles products API returning null', async () => {
    server.use(http.get('*/api/satellite/products', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles all APIs failing', async () => {
    server.use(
      http.get('*/api/satellite/composite-recipes', () => HttpResponse.error()),
      http.get('*/api/satellite/composites', () => HttpResponse.error()),
      http.get('*/api/satellite/products', () => HttpResponse.error()),
    );
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('renders composites with various statuses', async () => {
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
              file_path: '/tmp/c.png',
              file_size: 1024,
              status: 'completed',
              error: '',
              created_at: '2024-06-01',
            },
            {
              id: '2',
              name: 'True Color',
              recipe: 'true_color',
              satellite: 'GOES-16',
              sector: 'CONUS',
              capture_time: '2024-06-01T13:00:00',
              file_path: null,
              file_size: 0,
              status: 'failed',
              error: 'Missing bands',
              created_at: '2024-06-01',
            },
            {
              id: '3',
              name: 'True Color',
              recipe: 'true_color',
              satellite: 'GOES-16',
              sector: 'CONUS',
              capture_time: '2024-06-01T14:00:00',
              file_path: null,
              file_size: 0,
              status: 'pending',
              error: '',
              created_at: '2024-06-01',
            },
          ],
          total: 3,
          page: 1,
          limit: 20,
        }),
      ),
      http.get('*/api/satellite/products', () =>
        HttpResponse.json({ satellites: ['GOES-16'], sectors: [], bands: [] }),
      ),
    );
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
    });
  });

  it('handles recipes returned as object with items', async () => {
    server.use(
      http.get('*/api/satellite/composite-recipes', () =>
        HttpResponse.json({
          items: [{ id: 'true_color', name: 'True Color', bands: ['C01', 'C02', 'C03'] }],
        }),
      ),
      http.get('*/api/satellite/products', () =>
        HttpResponse.json({
          satellites: ['GOES-16'],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI' }],
          bands: [],
        }),
      ),
    );
    renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/True Color/i).length).toBeGreaterThan(0);
    });
  });

  it('handles empty recipes list', async () => {
    // Default handlers already serve empty recipes — no override needed.
    const { container } = renderWithProviders(<CompositesTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
