import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { id: 'preset-1', job_id: 'job-1' } })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';
import { getSectorsForSatellite } from '../components/GoesData/liveTabUtils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

const PRODUCTS = {
  satellites: ['GOES-16', 'GOES-18', 'GOES-19'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
    { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor (True Color Day, IR Night)' },
    { id: 'C01', description: 'Blue (0.47\u00b5m)' },
  ],
  default_satellite: 'GOES-16',
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

async function switchToHimawari() {
  await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('pill-strip-satellite'));
  await waitFor(() => expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument());
  fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));
  await waitFor(() => expect(screen.getByTestId('himawari-no-preview')).toBeInTheDocument());
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/satellite/products') return Promise.resolve({ data: PRODUCTS });
    if (url.startsWith('/satellite/latest')) {
      return Promise.reject(Object.assign(new Error('Not found'), { isAxiosError: true, response: { status: 404 } }));
    }
    if (url.startsWith('/satellite/catalog/latest')) return Promise.resolve({ data: null });
    return Promise.resolve({ data: {} });
  });
  mockedApi.post.mockResolvedValue({ data: { id: 'preset-1', job_id: 'job-1' } });
});

afterEach(() => { vi.restoreAllMocks(); });

describe('Himawari UX: Schedule Auto-fetch button', () => {
  it('shows button in empty state', async () => {
    renderLiveTab();
    await switchToHimawari();
    expect(screen.getByTestId('himawari-schedule-auto-fetch')).toBeInTheDocument();
    expect(screen.getByTestId('himawari-schedule-auto-fetch')).toHaveTextContent('Schedule Auto-fetch');
  });

  it('calls preset and schedule endpoints on click', async () => {
    renderLiveTab();
    await switchToHimawari();
    await act(async () => { fireEvent.click(screen.getByTestId('himawari-schedule-auto-fetch')); });

    await waitFor(() => {
      const presetCall = mockedApi.post.mock.calls.find((c: string[]) => c[0] === '/satellite/fetch-presets');
      expect(presetCall).toBeTruthy();
      expect(presetCall[1]).toEqual(expect.objectContaining({ satellite: 'Himawari-9', sector: 'FLDK' }));
    });
    await waitFor(() => {
      const scheduleCall = mockedApi.post.mock.calls.find((c: string[]) => c[0] === '/satellite/schedules');
      expect(scheduleCall).toBeTruthy();
      expect(scheduleCall[1]).toEqual(expect.objectContaining({ preset_id: 'preset-1', interval_minutes: 10, is_active: true }));
    });
  });

  it('shows success state after scheduling', async () => {
    renderLiveTab();
    await switchToHimawari();
    await act(async () => { fireEvent.click(screen.getByTestId('himawari-schedule-auto-fetch')); });
    await waitFor(() => { expect(screen.getByTestId('himawari-schedule-auto-fetch')).toHaveTextContent(/Auto-fetch scheduled/); });
    expect(screen.getByTestId('himawari-schedule-auto-fetch')).toBeDisabled();
  });

  it('shows error state on failure', async () => {
    mockedApi.post.mockRejectedValueOnce(new Error('Network error'));
    renderLiveTab();
    await switchToHimawari();
    await act(async () => { fireEvent.click(screen.getByTestId('himawari-schedule-auto-fetch')); });
    await waitFor(() => { expect(screen.getByTestId('himawari-schedule-auto-fetch')).toHaveTextContent('Retry Schedule'); });
    expect(screen.getByTestId('schedule-error')).toBeInTheDocument();
  });
});

describe('Himawari UX: Sector cadence labels', () => {
  it('HIMAWARI_SECTORS have cadence descriptions', () => {
    const sectors = getSectorsForSatellite('Himawari-9');
    expect(sectors[0]).toEqual(expect.objectContaining({ id: 'FLDK', description: '10-min cadence' }));
    expect(sectors[1]).toEqual(expect.objectContaining({ id: 'Japan', description: '2.5-min cadence' }));
    expect(sectors[2]).toEqual(expect.objectContaining({ id: 'Target', description: '2.5-min cadence' }));
  });

  it('shows cadence labels in sector selector', async () => {
    renderLiveTab();
    await switchToHimawari();
    await waitFor(() => expect(screen.getByTestId('pill-strip-sector')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('pill-strip-sector'));
    await waitFor(() => { expect(screen.getByTestId('sector-option-FLDK')).toBeInTheDocument(); });
    expect(screen.getByText('10-min cadence')).toBeInTheDocument();
    expect(screen.getAllByText('2.5-min cadence').length).toBe(2);
  });
});

describe('Himawari UX: S3 availability indicator', () => {
  it('shows "No recent data found on S3" when no catalog data', async () => {
    renderLiveTab();
    await switchToHimawari();
    await waitFor(() => { expect(screen.getByTestId('s3-availability')).toHaveTextContent('No recent data found on S3'); });
  });

  it('shows time-ago when S3 data available', async () => {
    const recentTime = new Date(Date.now() - 5 * 60_000).toISOString();
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/satellite/products') return Promise.resolve({ data: PRODUCTS });
      if (url.startsWith('/satellite/latest'))
        return Promise.reject(Object.assign(new Error('Not found'), { isAxiosError: true, response: { status: 404 } }));
      if (url.startsWith('/satellite/catalog/latest'))
        return Promise.resolve({ data: { scan_time: recentTime } });
      return Promise.resolve({ data: {} });
    });
    renderLiveTab();
    await switchToHimawari();
    await waitFor(() => { expect(screen.getByTestId('s3-availability')).toHaveTextContent(/Latest on S3: \d+ min ago/); });
  });

  it('makes catalog/latest API call for Himawari', async () => {
    renderLiveTab();
    await switchToHimawari();
    await waitFor(() => {
      const calls = mockedApi.get.mock.calls.filter(
        (c: unknown[]) => c[0] === '/satellite/catalog/latest' && (c[1] as Record<string, Record<string, string>> | undefined)?.params?.satellite === 'Himawari-9',
      );
      expect(calls.length).toBeGreaterThan(0);
    });
  });
});
