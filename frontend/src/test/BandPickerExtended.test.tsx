import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import BandPicker from '../components/GoesData/BandPicker';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderBandPicker(props: Partial<React.ComponentProps<typeof BandPicker>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <BandPicker value="C02" onChange={() => {}} satellite="GOES-16" sector="CONUS" {...props} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/band-availability') {
      return Promise.resolve({ data: { counts: { C02: 10, C13: 5 } } });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('BandPicker - Extended', () => {
  it('shows "No data yet" for bands without local data', async () => {
    renderBandPicker();
    await waitFor(() => {
      const noDataElements = screen.getAllByText('No data yet');
      expect(noDataElements.length).toBeGreaterThan(0);
    });
  });

  it('shows Fetch button for bands without data when satellite and sector are set', async () => {
    renderBandPicker();
    await waitFor(() => {
      const fetchButtons = screen.getAllByTitle(/Fetch sample for/);
      expect(fetchButtons.length).toBeGreaterThan(0);
    });
  });

  it('clicking Fetch button calls api.post', async () => {
    renderBandPicker();
    await waitFor(() => expect(screen.getAllByTitle(/Fetch sample for/).length).toBeGreaterThan(0));
    const fetchBtn = screen.getAllByTitle(/Fetch sample for/)[0];
    fireEvent.click(fetchBtn);
    expect(mockedApi.post).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
      satellite: 'GOES-16',
      sector: 'CONUS',
    }));
  });

  it('fetch sample shows success toast on success', async () => {
    mockedApi.post.mockResolvedValue({ data: {} });
    renderBandPicker();
    await waitFor(() => expect(screen.getAllByTitle(/Fetch sample for/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTitle(/Fetch sample for/)[0]);
    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalled();
    });
  });

  it('fetch sample handles error', async () => {
    mockedApi.post.mockRejectedValue(new Error('fail'));
    renderBandPicker();
    await waitFor(() => expect(screen.getAllByTitle(/Fetch sample for/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByTitle(/Fetch sample for/)[0]);
    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalled();
    });
  });

  it('does not show Fetch button without satellite', async () => {
    renderBandPicker({ satellite: undefined, sector: 'CONUS' });
    await waitFor(() => {
      // Band-availability query won't fire without satellite
      const fetchBtns = screen.queryAllByTitle(/Fetch sample for/);
      expect(fetchBtns.length).toBe(0);
    });
  });

  it('does not show Fetch button without sector', async () => {
    renderBandPicker({ satellite: 'GOES-16', sector: undefined });
    await waitFor(() => {
      const fetchBtns = screen.queryAllByTitle(/Fetch sample for/);
      expect(fetchBtns.length).toBe(0);
    });
  });

  it('filters to Storms preset', () => {
    renderBandPicker();
    fireEvent.click(screen.getByText('Storms'));
    // C07 should be visible (Storms includes it)
    expect(screen.getByText('C07')).toBeInTheDocument();
    // C03 should not be visible
    expect(screen.queryByText('C03')).not.toBeInTheDocument();
  });

  it('filters to Vegetation preset', () => {
    renderBandPicker();
    fireEvent.click(screen.getByText('Vegetation'));
    expect(screen.getByText('C02')).toBeInTheDocument();
    expect(screen.getByText('C03')).toBeInTheDocument();
    // C07 (IR) should not be visible
    expect(screen.queryByText('C07')).not.toBeInTheDocument();
  });

  it('handles band-availability returning empty counts', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/band-availability') return Promise.resolve({ data: { counts: {} } });
      return Promise.resolve({ data: {} });
    });
    renderBandPicker();
    await waitFor(() => {
      const noDataElements = screen.getAllByText('No data yet');
      // All bands should show "No data yet"
      expect(noDataElements.length).toBeGreaterThan(5);
    });
  });

  it('does not show "No data yet" for bands with data', async () => {
    // Set all bands as having data
    const allCounts: Record<string, number> = {};
    ['C01','C02','C03','C04','C05','C06','C07','C08','C09','C10','C11','C12','C13','C14','C15','C16'].forEach(b => allCounts[b] = 10);
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/band-availability') return Promise.resolve({ data: { counts: allCounts } });
      return Promise.resolve({ data: {} });
    });
    renderBandPicker();
    await waitFor(() => {
      expect(screen.queryByText('No data yet')).not.toBeInTheDocument();
    });
  });

  it('fetchSample does nothing without satellite', async () => {
    renderBandPicker({ satellite: undefined });
    // No fetch buttons should appear
    expect(screen.queryAllByTitle(/Fetch sample for/).length).toBe(0);
  });
});
