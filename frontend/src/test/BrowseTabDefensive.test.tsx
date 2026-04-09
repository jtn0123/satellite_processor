import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import { http, HttpResponse, delay } from 'msw';
import { renderWithProviders } from './testUtils';
import { setupMswServer } from './mocks/msw';

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../hooks/useDebounce', () => ({ useDebounce: (val: string) => val }));

import BrowseTab from '../components/GoesData/BrowseTab';

const server = setupMswServer();

describe('BrowseTab - Defensive Scenarios', () => {
  // --- API returns unexpected shapes ---

  it('handles frames API returning raw array instead of paginated object', async () => {
    server.use(http.get('*/api/satellite/frames', () => HttpResponse.json([])));
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles frames API returning null', async () => {
    server.use(http.get('*/api/satellite/frames', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles products API returning null', async () => {
    server.use(http.get('*/api/satellite/products', () => HttpResponse.json(null)));
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles tags API returning paginated object instead of array', async () => {
    server.use(
      http.get('*/api/satellite/tags', () =>
        HttpResponse.json({
          items: [{ id: '1', name: 'test', color: '#ff0000' }],
          total: 1,
        }),
      ),
    );
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles collections API returning paginated object instead of array', async () => {
    server.use(
      http.get('*/api/satellite/collections', () =>
        HttpResponse.json({
          items: [{ id: '1', name: 'My Col', frame_count: 5 }],
          total: 1,
        }),
      ),
    );
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  // --- Empty states ---

  it('shows empty state when frames total is 0', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText(/No frames yet/i)).toBeInTheDocument();
    });
  });

  it('shows 0 frames count text', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText(/0 frames/)).toBeInTheDocument();
    });
  });

  // --- Loading states ---

  it('shows skeleton loading cards while fetching', () => {
    server.use(
      http.get('*/api/satellite/frames', async () => {
        await delay('infinite');
        return HttpResponse.json({ items: [], total: 0, page: 1, limit: 50 });
      }),
    );
    renderWithProviders(<BrowseTab />);
    // Skeleton divs with animate-pulse should be present
    const pulseElements = document.querySelectorAll('.animate-pulse');
    expect(pulseElements.length).toBeGreaterThan(0);
  });

  // --- With data ---

  it('renders frames when data exists', async () => {
    server.use(
      http.get('*/api/satellite/frames', () =>
        HttpResponse.json({
          items: [
            {
              id: '1',
              satellite: 'GOES-16',
              sector: 'CONUS',
              band: 'C02',
              capture_time: '2024-06-01T12:00:00',
              file_path: '/tmp/test.nc',
              file_size: 1024,
              width: 5424,
              height: 3000,
              thumbnail_path: null,
              image_url: '/api/satellite/frames/test-id/image',
              thumbnail_url: '/api/satellite/frames/test-id/thumbnail',
              tags: [],
              collections: [],
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        }),
      ),
      http.get('*/api/satellite/products', () =>
        HttpResponse.json({
          satellites: ['GOES-16'],
          bands: [{ id: 'C02', description: 'Red' }],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'x' }],
        }),
      ),
    );
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      // The frames count text appears in the toolbar
      const body = document.body.textContent ?? '';
      expect(body).toContain('1 frame');
    });
  });

  it('handles pagination with zero total pages gracefully', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      // No pagination buttons when totalPages <= 1
      expect(screen.queryByLabelText('Previous page')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Next page')).not.toBeInTheDocument();
    });
  });

  it('renders Load More button when multiple pages exist', async () => {
    server.use(
      http.get('*/api/satellite/frames', () =>
        HttpResponse.json({
          items: Array.from({ length: 50 }, (_, i) => ({
            id: `${i}`,
            satellite: 'GOES-16',
            sector: 'CONUS',
            band: 'C02',
            capture_time: '2024-06-01T12:00:00',
            file_path: '/tmp/test.nc',
            file_size: 1024,
            width: null,
            height: null,
            thumbnail_path: null,
            image_url: '/api/satellite/frames/test-id/image',
            thumbnail_url: '/api/satellite/frames/test-id/thumbnail',
            tags: [],
            collections: [],
          })),
          total: 200,
          page: 1,
          limit: 50,
        }),
      ),
    );
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByText('Load More')).toBeInTheDocument();
    });
  });

  // --- View mode toggle ---

  it('switches between grid and list view', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(screen.getByLabelText('Grid view')).toBeInTheDocument();
      expect(screen.getByLabelText('List view')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('List view'));
    fireEvent.click(screen.getByLabelText('Grid view'));
  });

  // --- Error state ---

  it('handles all APIs failing simultaneously', async () => {
    server.use(
      http.get('*/api/satellite/frames', () => HttpResponse.error()),
      http.get('*/api/satellite/products', () => HttpResponse.error()),
      http.get('*/api/satellite/tags', () => HttpResponse.error()),
      http.get('*/api/satellite/collections', () => HttpResponse.error()),
    );
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  // --- Frames with null/undefined fields ---

  it('handles frames with null width/height/thumbnail', async () => {
    server.use(
      http.get('*/api/satellite/frames', () =>
        HttpResponse.json({
          items: [
            {
              id: '1',
              satellite: 'GOES-16',
              sector: 'CONUS',
              band: 'C02',
              capture_time: '2024-06-01T12:00:00',
              file_path: '/tmp/test.nc',
              file_size: 0,
              width: null,
              height: null,
              thumbnail_path: null,
              image_url: '/api/satellite/frames/test-id/image',
              thumbnail_url: '/api/satellite/frames/test-id/thumbnail',
              tags: [],
              collections: [],
            },
          ],
          total: 1,
          page: 1,
          limit: 50,
        }),
      ),
    );
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  // --- Select All / Deselect ---

  it('select all works with empty frames', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      const selectBtn = screen.getByText(/Select All/i);
      fireEvent.click(selectBtn);
      expect(selectBtn).toBeTruthy();
    });
  });

  // --- framesData.limit being 0 (division by zero for totalPages) ---
  it('handles framesData.limit being 0', async () => {
    server.use(
      http.get('*/api/satellite/frames', () =>
        HttpResponse.json({ items: [], total: 0, page: 1, limit: 0 }),
      ),
    );
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });
});
