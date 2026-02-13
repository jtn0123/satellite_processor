import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import GoesData from '../pages/GoesData';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/goes']}>
        <Routes>
          <Route path="/goes" element={<GoesData />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
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
          bands: [{ id: 'C02', description: 'Red (0.64µm)' }],
        },
      });
    }
    if (url.includes('/frames')) {
      return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
    }
    if (url === '/goes/collections') return Promise.resolve({ data: [] });
    if (url === '/goes/tags') return Promise.resolve({ data: [] });
    if (url === '/goes/frames/stats') {
      return Promise.resolve({ data: { total_frames: 0, total_size_bytes: 0, by_satellite: {}, by_band: {} } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('GoesData page extended', () => {
  it('renders multiple tab buttons', async () => {
    renderPage();
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(3);
    });
  });

  it('shows satellite product info', async () => {
    renderPage();
    await waitFor(() => {
      // Should display satellite selector once products load
      const selects = document.querySelectorAll('select');
      expect(selects.length).toBeGreaterThan(0);
    });
  });

  it('renders filter controls', async () => {
    renderPage();
    await waitFor(() => {
      // Browse tab has filter selects
      const selects = document.querySelectorAll('select');
      expect(selects.length).toBeGreaterThan(0);
    });
  });

  it('handles empty frame list gracefully', async () => {
    renderPage();
    await waitFor(() => {
      // Should render without crashing even with empty data
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it('has accessible buttons', async () => {
    renderPage();
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      buttons.forEach(btn => {
        // Each button should have some content (text or aria-label)
        const hasContent = btn.textContent || btn.getAttribute('aria-label') || btn.querySelector('svg');
        expect(hasContent).toBeTruthy();
      });
    });
  });
});
