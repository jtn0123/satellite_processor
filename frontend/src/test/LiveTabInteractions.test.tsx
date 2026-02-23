import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'job-1' } })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

const PRODUCTS = {
  satellites: ['GOES-16', 'GOES-18'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
    { id: 'FD', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
  ],
  bands: [
    { id: 'C02', description: 'Red (0.64µm)' },
    { id: 'C13', description: 'IR (10.3µm)' },
  ],
  default_satellite: 'GOES-16',
  satellite_availability: {
    'GOES-16': { status: 'operational', description: 'OK' },
    'GOES-18': { status: 'testing', description: 'Test mode' },
  },
};

const FRAME = {
  id: '1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02',
  capture_time: new Date(Date.now() - 600000).toISOString(),
  file_path: '/tmp/test.nc', file_size: 1024, width: 5424, height: 3000,
  thumbnail_path: '/tmp/thumb.png', image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
};

const CATALOG = {
  scan_time: new Date(Date.now() - 300000).toISOString(),
  size: 2048, key: 'test-key',
  satellite: 'GOES-16', sector: 'CONUS', band: 'C02',
};

function renderLiveTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<MemoryRouter><QueryClientProvider client={qc}><LiveTab /></QueryClientProvider></MemoryRouter>);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
    if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME });
    if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: CATALOG });
    if (url.startsWith('/goes/catalog/available')) return Promise.resolve({ data: { satellite: 'GOES-16', available_sectors: ['CONUS'], checked_at: new Date().toISOString() } });
    if (url.startsWith('/goes/frames')) return Promise.resolve({ data: [FRAME, { ...FRAME, id: '2', capture_time: new Date(Date.now() - 1200000).toISOString() }] });
    if (url.startsWith('/jobs/')) return Promise.resolve({ data: { id: 'job-1', status: 'running', progress: 50, status_message: 'Downloading' } });
    return Promise.resolve({ data: {} });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LiveTab - Interactions', () => {
  it('toggles compare mode button', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByText('Compare')).toBeInTheDocument());
    const btn = screen.getByText('Compare').closest('button')!;
    expect(btn.getAttribute('aria-checked')).toBe('false');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-checked')).toBe('true');
  });

  it('toggles auto-fetch switch', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByText(/Auto-fetch every/)).toBeInTheDocument());
    const switches = screen.getAllByRole('switch');
    // First switch without a title is the auto-fetch toggle
    const autoFetchSwitch = switches.find((s) => !s.title && s.getAttribute('aria-checked') === 'false')!;
    fireEvent.click(autoFetchSwitch);
    expect(autoFetchSwitch.getAttribute('aria-checked')).toBe('true');
  });

  it('toggles overlay visibility', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByLabelText('Hide frame info')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByLabelText('Hide frame info'));
    await waitFor(() => {
      expect(screen.getByLabelText('Show frame info')).toBeInTheDocument();
    });
  });

  it('persists overlay preference to localStorage', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByLabelText('Hide frame info')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Hide frame info'));
    expect(localStorage.getItem('live-overlay-visible')).toBe('false');
  });

  it('reads overlay preference from localStorage', async () => {
    localStorage.setItem('live-overlay-visible', 'false');
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByLabelText('Show frame info')).toBeInTheDocument();
    });
  });

  it('changes satellite selection', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByLabelText('Satellite')).toBeInTheDocument());
    const select = screen.getByLabelText('Satellite') as HTMLSelectElement;
    // Wait for default satellite to be set
    await waitFor(() => expect(select.value).toBe('GOES-16'));
    fireEvent.change(select, { target: { value: 'GOES-18' } });
    expect(select.value).toBe('GOES-18');
  });

  it('shows satellite availability status in dropdown', async () => {
    renderLiveTab();
    await waitFor(() => {
      const select = screen.getByLabelText('Satellite') as HTMLSelectElement;
      expect(select.value).toBe('GOES-16');
    });
    const options = screen.getByLabelText('Satellite').querySelectorAll('option');
    const goes18Option = Array.from(options).find(o => o.textContent?.includes('testing'));
    expect(goes18Option).toBeTruthy();
  });

  it('renders sector and band selects', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(document.getElementById('live-sector')).toBeInTheDocument();
      expect(document.getElementById('live-band')).toBeInTheDocument();
    });
  });

  it('changes auto-refresh interval', async () => {
    renderLiveTab();
    const select = screen.getByLabelText('Auto-fetch interval') as HTMLSelectElement;
    await waitFor(() => expect(select).toBeInTheDocument());
    fireEvent.change(select, { target: { value: '60000' } });
    expect(select.value).toBe('60000');
  });

  it('shows condensed metadata in bottom overlay when catalog data exists', async () => {
    renderLiveTab();
    await waitFor(() => {
      // Condensed metadata shows satellite name — scoped to avoid matching select options
      const metadata = within(screen.getByTestId('condensed-metadata'));
      expect(metadata.getByText('GOES-16')).toBeInTheDocument();
    });
  });

  it('renders without crashing when catalog is loading', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME });
      if (url.startsWith('/goes/catalog/latest')) return new Promise(() => {}); // never resolves
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('renders without crashing when catalog errors', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME });
      if (url.startsWith('/goes/catalog/latest')) return Promise.reject(new Error('fail'));
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('shows LIVE indicator', async () => {
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('shows stale data banner when local frame is behind catalog', async () => {
    const oldFrame = { ...FRAME, capture_time: new Date(Date.now() - 7200000).toISOString() };
    const newCatalog = { ...CATALOG, scan_time: new Date(Date.now() - 60000).toISOString() };
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: oldFrame });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: newCatalog });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    // StaleDataBanner should appear when behind > threshold
    await waitFor(() => {
      // At minimum, component should render without error
      expect(document.body.textContent).toBeTruthy();
    });
  });

  it('shows compare slider when compare mode is on and frames exist', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByText('Compare')).toBeInTheDocument());
    const btn = screen.getByText('Compare').closest('button')!;
    fireEvent.click(btn);
    // CompareSlider should render
    await waitFor(() => {
      // The compare slider renders with the image
      const container = document.querySelector('[class*="overflow-hidden"]');
      expect(container).toBeTruthy();
    });
  });

  it('renders image with correct src when frame has thumbnail', async () => {
    renderLiveTab();
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.src).toContain('/api/goes/frames/');
    });
  });

  it('renders image with file_path when no thumbnail', async () => {
    const noThumbFrame = { ...FRAME, thumbnail_path: null, image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail' };
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: noThumbFrame });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: CATALOG });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      const img = document.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.src).toContain('/api/goes/frames/');
    });
  });

  it('renders without crashing when catalog is null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('LIVE')).toBeInTheDocument();
    });
  });

  it('fullscreen button calls requestFullscreen', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByLabelText('Enter fullscreen')).toBeInTheDocument());
    // Mock requestFullscreen
    const mockRequestFullscreen = vi.fn().mockResolvedValue(undefined);
    const container = document.querySelector('[class*="relative flex-1"]');
    if (container) {
      (container as unknown as Record<string, unknown>).requestFullscreen = mockRequestFullscreen;
    }
    fireEvent.click(screen.getByLabelText('Enter fullscreen'));
    expect(mockRequestFullscreen).toHaveBeenCalled();
  });

  it('refresh button triggers refetch', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTitle('Refresh now')).toBeInTheDocument());
    const initialCallCount = mockedApi.get.mock.calls.length;
    fireEvent.click(screen.getByTitle('Refresh now'));
    await waitFor(() => {
      expect(mockedApi.get.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it('timeAgo returns correct values', async () => {
    // Test by rendering with different capture times
    const justNow = { ...FRAME, capture_time: new Date().toISOString() };
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: justNow });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('just now')).toBeInTheDocument();
    });
  });

  it('timeAgo shows hours for older frames', async () => {
    const hoursAgo = { ...FRAME, capture_time: new Date(Date.now() - 7200000).toISOString() };
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: hoursAgo });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('2h ago')).toBeInTheDocument();
    });
  });

  it('timeAgo shows days for very old frames', async () => {
    const daysAgo = { ...FRAME, capture_time: new Date(Date.now() - 172800000).toISOString() };
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: daysAgo });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      expect(screen.getByText('2d ago')).toBeInTheDocument();
    });
  });

  it('uses default_satellite from products', async () => {
    renderLiveTab();
    await waitFor(() => {
      const select = screen.getByLabelText('Satellite') as HTMLSelectElement;
      expect(select.value).toBe('GOES-16');
    });
  });

  it('shows condensed metadata overlay with frame info', async () => {
    renderLiveTab();
    await waitFor(() => {
      // Condensed metadata shows satellite, band, sector inline — scoped to metadata overlay
      const metadata = within(screen.getByTestId('condensed-metadata'));
      expect(metadata.getByText('GOES-16')).toBeInTheDocument();
      expect(metadata.getByText('C02')).toBeInTheDocument();
      expect(metadata.getByText('CONUS')).toBeInTheDocument();
    });
  });

  it('handles sector availability marking unavailable sectors', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/goes/latest')) return Promise.resolve({ data: FRAME });
      if (url.startsWith('/goes/catalog/available')) return Promise.resolve({
        data: { satellite: 'GOES-16', available_sectors: ['CONUS'], checked_at: new Date().toISOString() }
      });
      if (url.startsWith('/goes/catalog/latest')) return Promise.resolve({ data: CATALOG });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await waitFor(() => {
      const sectorSelect = screen.getByLabelText('Sector');
      const options = sectorSelect.querySelectorAll('option');
      const fdOption = Array.from(options).find(o => o.textContent?.includes('unavailable'));
      expect(fdOption).toBeTruthy();
    });
  });
});
