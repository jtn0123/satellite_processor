import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
  satellites: ['GOES-16', 'GOES-18', 'GOES-19'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
    { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
    { id: 'Mesoscale1', name: 'Meso 1', product: 'ABI-L2-CMIPM' },
    { id: 'Mesoscale2', name: 'Meso 2', product: 'ABI-L2-CMIPM' },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor (True Color Day, IR Night)' },
    { id: 'C01', description: 'Blue (0.47µm)' },
    { id: 'C02', description: 'Red (0.64µm)' },
  ],
  default_satellite: 'GOES-16',
};

const FRAME = {
  id: '1',
  satellite: 'GOES-16',
  sector: 'CONUS',
  band: 'GEOCOLOR',
  capture_time: new Date(Date.now() - 600000).toISOString(),
  file_size: 1024,
  width: 5424,
  height: 3000,
  image_url: '/api/satellite/frames/test-id/image',
  thumbnail_url: '/api/satellite/frames/test-id/thumbnail',
};

function renderLiveTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
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
  localStorage.clear();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/satellite/products') return Promise.resolve({ data: PRODUCTS });
    if (url.startsWith('/satellite/latest')) return Promise.resolve({ data: FRAME });
    if (url.startsWith('/satellite/catalog/latest')) return Promise.resolve({ data: null });
    return Promise.resolve({ data: {} });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LiveTab - Himawari satellite switching', () => {
  it('satellite dropdown shows all 4 options including Himawari-9', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Expand satellite options
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));

    await waitFor(() => {
      expect(screen.getByTestId('satellite-option-GOES-16')).toBeInTheDocument();
      expect(screen.getByTestId('satellite-option-GOES-18')).toBeInTheDocument();
      expect(screen.getByTestId('satellite-option-GOES-19')).toBeInTheDocument();
      expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument();
    });
  });

  it('selecting Himawari-9 resets sector to FLDK and band to TrueColor', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Expand satellite options and select Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() =>
      expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    // Verify status pill shows Himawari-9 and TrueColor
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('Himawari-9');
      expect(pill.textContent).toContain('TrueColor');
    });
  });

  it('Himawari sector options are FLDK, Japan, Target', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Switch to Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() =>
      expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    // Wait for switch to complete
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('Himawari-9');
    });

    // Expand sector options
    fireEvent.click(screen.getByTestId('pill-strip-sector'));

    await waitFor(() => {
      expect(screen.getByTestId('sector-option-FLDK')).toBeInTheDocument();
      expect(screen.getByTestId('sector-option-Japan')).toBeInTheDocument();
      expect(screen.getByTestId('sector-option-Target')).toBeInTheDocument();
    });

    // GOES sectors should NOT be present
    expect(screen.queryByTestId('sector-option-CONUS')).not.toBeInTheDocument();
    expect(screen.queryByTestId('sector-option-FullDisk')).not.toBeInTheDocument();
  });

  it('GOES sector options are FullDisk, CONUS, Meso1, Meso2', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-sector')).toBeInTheDocument());

    // Expand sector options (should show GOES sectors by default)
    fireEvent.click(screen.getByTestId('pill-strip-sector'));

    await waitFor(() => {
      expect(screen.getByTestId('sector-option-CONUS')).toBeInTheDocument();
      expect(screen.getByTestId('sector-option-FullDisk')).toBeInTheDocument();
      expect(screen.getByTestId('sector-option-Mesoscale1')).toBeInTheDocument();
      expect(screen.getByTestId('sector-option-Mesoscale2')).toBeInTheDocument();
    });
  });

  it('Himawari band options include TrueColor and B01-B16', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Switch to Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() =>
      expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    await waitFor(() => {
      expect(screen.getByTestId('band-pill-TrueColor')).toBeInTheDocument();
      expect(screen.getByTestId('band-pill-B01')).toBeInTheDocument();
      expect(screen.getByTestId('band-pill-B16')).toBeInTheDocument();
    });

    // GOES bands should NOT be present
    expect(screen.queryByTestId('band-pill-GEOCOLOR')).not.toBeInTheDocument();
    expect(screen.queryByTestId('band-pill-C01')).not.toBeInTheDocument();
  });

  it('switching back to GOES resets sector to CONUS and band to GEOCOLOR', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Switch to Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() =>
      expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    await waitFor(() => {
      expect(screen.getByTestId('status-pill').textContent).toContain('Himawari-9');
    });

    // Switch back to GOES-18
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() => expect(screen.getByTestId('satellite-option-GOES-18')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('satellite-option-GOES-18'));

    // Should show GOES defaults
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-18');
      expect(pill.textContent).toContain('GEOCOLOR');
    });

    // GOES bands should be visible
    await waitFor(() => {
      expect(screen.getByTestId('band-pill-GEOCOLOR')).toBeInTheDocument();
    });
  });

  it('CDN preview is not available for Himawari (shows no-preview message)', async () => {
    // No local frame for Himawari
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/satellite/latest')) {
        const axiosError = Object.assign(new Error('Not found'), {
          isAxiosError: true,
          response: { status: 404 },
        });
        return Promise.reject(axiosError);
      }
      if (url.startsWith('/satellite/catalog/latest')) return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });

    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Switch to Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() =>
      expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    // Should show "no preview available" for Himawari
    await waitFor(() => {
      expect(screen.getByTestId('himawari-no-preview')).toBeInTheDocument();
    });
  });

  it('existing GOES behavior is preserved', async () => {
    renderLiveTab();

    // Default satellite should be GOES-16
    await waitFor(() => {
      const pill = screen.getByTestId('status-pill');
      expect(pill.textContent).toContain('GOES-16');
      expect(pill.textContent).toContain('GEOCOLOR');
    });

    // Band pills should show GOES bands
    await waitFor(() => {
      expect(screen.getByTestId('band-pill-GEOCOLOR')).toBeInTheDocument();
      expect(screen.getByTestId('band-pill-C01')).toBeInTheDocument();
      expect(screen.getByTestId('band-pill-C02')).toBeInTheDocument();
    });

    // Switching bands should work
    fireEvent.click(screen.getByTestId('band-pill-C02'));
    await waitFor(() => {
      expect(screen.getByTestId('band-pill-C02').getAttribute('aria-pressed')).toBe('true');
    });
  });
});
