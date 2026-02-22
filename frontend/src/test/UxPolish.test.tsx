import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LazyImage from '../components/GoesData/LazyImage';

// --- LazyImage error placeholder tests ---

type IOCallback = IntersectionObserverCallback;

function setupIO() {
  let storedCb: IOCallback | null = null;
  const instances: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];

  class MockIO {
    observe = vi.fn();
    disconnect = vi.fn();
    unobserve = vi.fn();
    constructor(cb: IOCallback) {
      storedCb = cb;
      instances.push(this);
    }
  }

  vi.stubGlobal('IntersectionObserver', MockIO);

  function trigger() {
    const inst = instances[instances.length - 1];
    if (storedCb && inst) {
      act(() => {
        storedCb!([{ isIntersecting: true } as IntersectionObserverEntry], inst as unknown as IntersectionObserver);
      });
    }
  }

  return { trigger, instances };
}

describe('LazyImage — error placeholder', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('shows ImageOff icon and "Image unavailable" text on error', () => {
    const io = setupIO();
    render(<LazyImage src="/broken.jpg" alt="test" />);
    io.trigger();
    const img = screen.getByRole('img');
    fireEvent.error(img);

    const placeholder = screen.getByTestId('image-error-placeholder');
    expect(placeholder).toBeInTheDocument();
    expect(screen.getByText('Image unavailable')).toBeInTheDocument();
    expect(placeholder.querySelector('svg')).toBeInTheDocument();
  });

  it('error placeholder has dark theme classes', () => {
    const io = setupIO();
    render(<LazyImage src="/broken.jpg" alt="test" />);
    io.trigger();
    fireEvent.error(screen.getByRole('img'));

    const placeholder = screen.getByTestId('image-error-placeholder');
    expect(placeholder.className).toContain('dark:bg-slate-800');
    expect(placeholder.className).toContain('dark:text-slate-500');
  });
});

// --- BrowseTab clear filters tests ---

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));
vi.mock('../hooks/useDebounce', () => ({ useDebounce: (val: string) => val }));

import BrowseTab from '../components/GoesData/BrowseTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderBrowse() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}><BrowseTab /></QueryClientProvider>);
}

describe('BrowseTab — clear filters button', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedApi.get.mockImplementation((url: string) => {
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 50 } });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['G16', 'G18'], bands: [{ id: 'C01' }], sectors: [{ id: 'CONUS', name: 'CONUS' }] } });
      if (url === '/goes/tags') return Promise.resolve({ data: [] });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
  });

  it('does not show "Clear all" when no filters active', async () => {
    renderBrowse();
    await waitFor(() => expect(screen.queryByText('Clear all')).not.toBeInTheDocument());
  });

  it('shows "Clear all" when a filter is active and resets on click', async () => {
    const user = userEvent.setup();
    renderBrowse();

    // Wait for products to load so selects have options
    const satSelect = await waitFor(() => {
      const el = document.getElementById('browse-satellite') as HTMLSelectElement;
      expect(el).toBeTruthy();
      return el;
    });

    // Wait for options to render
    await waitFor(() => {
      expect(satSelect.querySelectorAll('option').length).toBeGreaterThan(1);
    });

    // Set a filter using userEvent
    await user.selectOptions(satSelect, 'G16');

    const clearBtn = await screen.findByText('Clear all');
    expect(clearBtn).toBeInTheDocument();

    await user.click(clearBtn);

    // Filter should be reset
    expect(satSelect.value).toBe('');
    // Clear all should disappear
    await waitFor(() => expect(screen.queryByText('Clear all')).not.toBeInTheDocument());
  });
});
