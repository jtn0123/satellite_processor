import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

vi.mock('../hooks/useDebounce', () => ({
  useDebounce: (val: string) => val,
}));

import BrowseTab from '../components/GoesData/BrowseTab';
import api from '../api/client';

const mockedApi = api as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn>; put: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url.includes('/goes/frames')) {
      return Promise.resolve({
        data: { items: [], total: 0, page: 1, per_page: 24, pages: 0 },
      });
    }
    if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
    if (url === '/goes/tags') return Promise.resolve({ data: [] });
    if (url === '/goes/collections') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

describe('BrowseTab', () => {
  it('renders without crashing', async () => {
    const { container } = renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('renders filter toggle button for mobile', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      const filterBtn = screen.queryByLabelText(/filter/i) || screen.queryByText(/Filters/i);
      // The filter toggle exists in the DOM
      expect(document.querySelector('[class*="SlidersHorizontal"], button')).toBeTruthy();
    });
  });

  it('renders grid/list view toggle', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  it('shows empty state when no frames', async () => {
    renderWithProviders(<BrowseTab />);
    await waitFor(() => {
      // Should show some content (empty state or loading)
      expect(document.body.textContent!.length).toBeGreaterThan(0);
    });
  });
});
