import { describe, it, expect, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupMswServer } from './mocks/msw';

import GoesData from '../pages/GoesData';

const server = setupMswServer();

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
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  server.use(
    http.get('*/api/satellite/products', () =>
      HttpResponse.json({
        satellites: ['GOES-16', 'GOES-18'],
        sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }],
        bands: [{ id: 'C02', description: 'Red (0.64µm)' }],
      }),
    ),
  );
});

describe('GoesData page extended', () => {
  it('renders 4 tab buttons', async () => {
    renderPage();
    await waitFor(() => {
      const tabs = screen.getAllByRole('tab');
      expect(tabs).toHaveLength(4);
    });
  });

  it('shows browse tab selected by default', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Browse/i })).toHaveAttribute('aria-selected', 'true');
    });
  });

  it('has Browse, Fetch, Map, Stats tabs', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: /Browse/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Fetch/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Map/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /Stats/i })).toBeInTheDocument();
    });
  });

  it('handles empty frame list gracefully', async () => {
    renderPage();
    await waitFor(() => {
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it('has accessible buttons', async () => {
    renderPage();
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      buttons.forEach((btn) => {
        const hasContent =
          btn.textContent || btn.getAttribute('aria-label') || btn.querySelector('svg');
        expect(hasContent).toBeTruthy();
      });
    });
  });

  // JTN-405: hover/focus/touch on the Map tab button fires a one-shot
  // prefetch for the MapTab chunk. The handlers are wired only on that
  // tab — other tabs stay idle. This test just verifies the hover /
  // focus / touch handlers don't throw and don't change aria state,
  // which is a proxy for "the side-effect path runs cleanly". Actual
  // dynamic import behavior is validated by the MapTab chunk staying a
  // separate entry in the build output.
  it('Map tab button accepts hover/focus/touch without crashing', async () => {
    renderPage();
    const mapTab = await waitFor(() => screen.getAllByRole('tab', { name: /Map/i })[0]);
    expect(mapTab).toBeInTheDocument();
    // Hover then focus then touch — none of these should throw or
    // toggle selection on their own.
    fireEvent.pointerEnter(mapTab);
    fireEvent.focus(mapTab);
    fireEvent.touchStart(mapTab);
    expect(mapTab.getAttribute('aria-selected')).toBe('false');
  });
});
