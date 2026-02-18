import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'test-job-123' } })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

import api from '../api/client';
import { showToast } from '../utils/toast';
import Dashboard from '../pages/Dashboard';
import FetchTab from '../components/GoesData/FetchTab';

const mockApi = vi.mocked(api);
const mockShowToast = vi.mocked(showToast);

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Dashboard "Fetch Latest" Tests ──────────────────────────────

const dashboardStats = {
  total_frames: 10,
  frames_by_satellite: { 'GOES-19': 10 },
  last_fetch_time: '2026-01-01T00:00:00Z',
  active_schedules: 0,
  recent_jobs: [],
  storage_by_satellite: {},
  storage_by_band: {},
};

const defaultStats = { total_images: 5, total_jobs: 1, active_jobs: 0, storage: { used: 100, total: 1000 } };

function setupDashboardMocks(overrides: Record<string, unknown> = {}) {
  const stats = overrides.dashboardStats ?? dashboardStats;
  const appStats = overrides.stats ?? defaultStats;
  (mockApi.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url === '/goes/dashboard-stats') return Promise.resolve({ data: stats });
    if (url === '/stats') return Promise.resolve({ data: appStats });
    if (url === '/health/detailed') return Promise.resolve({ data: { status: 'ok', checks: {} } });
    if (url === '/jobs') return Promise.resolve({ data: { items: [], total: 0 } });
    return Promise.resolve({ data: [] });
  });
}

describe('Dashboard Fetch Latest', () => {
  it('renders Fetch Latest button when GOES data exists', async () => {
    setupDashboardMocks();
    wrap(<Dashboard />);
    expect(await screen.findByTestId('dashboard-fetch-latest')).toBeInTheDocument();
  });

  it('calls POST /goes/fetch with correct params on click', async () => {
    setupDashboardMocks();
    wrap(<Dashboard />);
    const btn = await screen.findByTestId('dashboard-fetch-latest');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
        satellite: 'GOES-19',
        sector: 'CONUS',
        band: 'C02',
      }));
    });
  });

  it('shows success toast after fetch', async () => {
    setupDashboardMocks();
    (mockApi.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ data: { job_id: 'abc-123' } });
    wrap(<Dashboard />);
    const btn = await screen.findByTestId('dashboard-fetch-latest');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('Fetching latest CONUS imagery'));
    });
  });

  it('shows error toast on API failure', async () => {
    setupDashboardMocks();
    (mockApi.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Network error'));
    wrap(<Dashboard />);
    const btn = await screen.findByTestId('dashboard-fetch-latest');
    fireEvent.click(btn);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to fetch latest imagery');
    });
  });

  it('renders Fetch Latest in onboarding state (zero frames)', async () => {
    setupDashboardMocks({
      dashboardStats: { ...dashboardStats, total_frames: 0 },
      stats: { total_images: 0, total_jobs: 0, active_jobs: 0, storage: { used: 0, total: 1000 } },
    });
    wrap(<Dashboard />);
    expect(await screen.findByTestId('dashboard-fetch-latest')).toBeInTheDocument();
  });

  it('disables button while fetching', async () => {
    setupDashboardMocks();
    let resolvePost!: (v: unknown) => void;
    (mockApi.post as ReturnType<typeof vi.fn>).mockImplementationOnce(() => new Promise((r) => { resolvePost = r; }));
    wrap(<Dashboard />);
    const btn = await screen.findByTestId('dashboard-fetch-latest');
    fireEvent.click(btn);
    expect(btn).toBeDisabled();
    resolvePost({ data: { job_id: 'x' } });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('sends ISO timestamps with start_time and end_time', async () => {
    setupDashboardMocks();
    wrap(<Dashboard />);
    const btn = await screen.findByTestId('dashboard-fetch-latest');
    fireEvent.click(btn);
    await waitFor(() => {
      const call = (mockApi.post as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1]).toHaveProperty('start_time');
      expect(call[1]).toHaveProperty('end_time');
      expect(call[1].start_time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

// ─── FetchTab Quick Fetch Tests ──────────────────────────────────

describe('FetchTab Quick Fetch', () => {
  beforeEach(() => {
    (mockApi.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-19'], satellite_availability: {}, sectors: [], bands: [], default_satellite: 'GOES-19' } });
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
  });

  it('renders quick fetch chips', async () => {
    wrap(<FetchTab />);
    expect(await screen.findByText('CONUS Last Hour')).toBeInTheDocument();
    expect(screen.getByText('CONUS Last 6hr')).toBeInTheDocument();
    expect(screen.getByText('Full Disk Latest')).toBeInTheDocument();
    expect(screen.getByText('All Bands 1hr')).toBeInTheDocument();
  });

  it('clicking CONUS Last Hour triggers fetch with correct params', async () => {
    wrap(<FetchTab />);
    const chip = await screen.findByText('CONUS Last Hour');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
        satellite: 'GOES-19',
        sector: 'CONUS',
        band: 'C02',
      }));
    });
  });

  it('clicking Full Disk Latest triggers fetch with FullDisk sector', async () => {
    wrap(<FetchTab />);
    const chip = await screen.findByText('Full Disk Latest');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
        satellite: 'GOES-19',
        sector: 'FullDisk',
        band: 'C02',
      }));
    });
  });

  it('clicking All Bands 1hr triggers 3 separate fetches', async () => {
    (mockApi.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { job_id: 'j1' } });
    wrap(<FetchTab />);
    const chip = await screen.findByText('All Bands 1hr');
    fireEvent.click(chip);
    await waitFor(() => {
      const postCalls = (mockApi.post as ReturnType<typeof vi.fn>).mock.calls;
      expect(postCalls.length).toBe(3);
      const bands = postCalls.map((c: unknown[]) => (c[1] as { band: string }).band);
      expect(bands).toContain('C01');
      expect(bands).toContain('C02');
      expect(bands).toContain('C03');
    });
  });

  it('shows success toast after quick fetch', async () => {
    wrap(<FetchTab />);
    const chip = await screen.findByText('CONUS Last Hour');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('success', 'Quick fetch started: CONUS Last Hour');
    });
  });

  it('shows error toast on quick fetch failure', async () => {
    (mockApi.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('fail'));
    wrap(<FetchTab />);
    const chip = await screen.findByText('CONUS Last Hour');
    fireEvent.click(chip);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed: CONUS Last Hour');
    });
  });

  it('wizard is hidden by default', async () => {
    wrap(<FetchTab />);
    await screen.findByText('Quick Fetch');
    expect(screen.queryByText('Choose Satellite')).not.toBeInTheDocument();
  });

  it('Advanced toggle shows wizard', async () => {
    wrap(<FetchTab />);
    const toggle = await screen.findByTestId('advanced-fetch-toggle');
    fireEvent.click(toggle);
    expect(await screen.findByText('Source')).toBeInTheDocument();
  });

  it('renders preset chips when presets exist', async () => {
    (mockApi.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-19'], satellite_availability: {}, sectors: [], bands: [], default_satellite: 'GOES-19' } });
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [{ id: 1, name: 'My CONUS Preset' }, { id: 2, name: 'Night Watch' }] });
      return Promise.resolve({ data: {} });
    });
    wrap(<FetchTab />);
    expect(await screen.findByText('My CONUS Preset')).toBeInTheDocument();
    expect(screen.getByText('Night Watch')).toBeInTheDocument();
  });

  it('clicking a preset chip calls the preset run endpoint', async () => {
    (mockApi.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: ['GOES-19'], satellite_availability: {}, sectors: [], bands: [], default_satellite: 'GOES-19' } });
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [{ id: 42, name: 'Storm Watch' }] });
      return Promise.resolve({ data: {} });
    });
    wrap(<FetchTab />);
    const preset = await screen.findByText('Storm Watch');
    fireEvent.click(preset);
    await waitFor(() => {
      expect(mockApi.post).toHaveBeenCalledWith('/goes/fetch-presets/42/run');
    });
  });
});
