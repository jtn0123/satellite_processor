import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderLiveTab() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LiveTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') {
      return Promise.resolve({
        data: {
          satellites: ['GOES-16', 'GOES-18'],
          sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }],
          bands: [
            { id: 'GEOCOLOR', description: 'GeoColor' },
            { id: 'C02', description: 'Red Visible' },
            { id: 'C13', description: 'Clean IR' },
          ],
        },
      });
    }
    if (url.startsWith('/goes/latest')) {
      return Promise.resolve({
        data: {
          id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'GEOCOLOR',
          capture_time: '2024-06-01T12:00:00', file_path: '/tmp/test.nc',
          file_size: 1024, width: 5424, height: 3000, thumbnail_path: null,
          image_url: '/api/goes/frames/1/image', thumbnail_url: '/api/goes/frames/1/thumbnail',
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('LiveTab keyboard hotkeys', () => {
  it('renders the a11y announcer', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByTestId('live-a11y-announcer')).toBeInTheDocument();
    });
  });

  it('announces band change on ArrowRight', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByTestId('live-a11y-announcer')).toBeInTheDocument();
    });

    // Wait for products to load
    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/goes/products');
    });

    // Press ArrowRight
    fireEvent.keyDown(document, { key: 'ArrowRight' });

    await waitFor(() => {
      const announcer = screen.getByTestId('live-a11y-announcer');
      expect(announcer.textContent).toContain('Band:');
    });
  });

  it('announces compare mode toggle on "c" key', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByTestId('live-a11y-announcer')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'c' });

    await waitFor(() => {
      const announcer = screen.getByTestId('live-a11y-announcer');
      expect(announcer.textContent).toContain('Compare mode');
    });
  });

  it('announces band change on ArrowLeft', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByTestId('live-a11y-announcer')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(mockedApi.get).toHaveBeenCalledWith('/goes/products');
    });

    fireEvent.keyDown(document, { key: 'ArrowLeft' });

    await waitFor(() => {
      const announcer = screen.getByTestId('live-a11y-announcer');
      expect(announcer.textContent).toContain('Band:');
    });
  });

  it('announces fullscreen toggle on "f" key', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByTestId('live-a11y-announcer')).toBeInTheDocument();
    });

    fireEvent.keyDown(document, { key: 'f' });

    await waitFor(() => {
      const announcer = screen.getByTestId('live-a11y-announcer');
      expect(announcer.textContent).toContain('fullscreen');
    });
  });

  it('announcer has aria-live="polite"', async () => {
    renderLiveTab();
    await waitFor(() => {
      const announcer = screen.getByTestId('live-a11y-announcer');
      expect(announcer.getAttribute('aria-live')).toBe('polite');
      expect(announcer.getAttribute('aria-atomic')).toBe('true');
    });
  });
});
