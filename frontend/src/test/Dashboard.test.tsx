import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

vi.mock('../hooks/useApi', () => ({
  useImages: () => ({ data: [], isLoading: false }),
  useJobs: () => ({
    data: [],
    isLoading: false,
    error: null,
  }),
  useSystemStatus: () => ({
    data: {
      cpu_percent: 10,
      memory: { total: 16e9, available: 12e9, percent: 25 },
      disk: { total: 500e9, free: 400e9, percent: 20 },
    },
    isLoading: false,
  }),
  useDeleteJob: () => ({ mutate: vi.fn() }),
  useStats: () => ({
    data: { total_images: 10, total_jobs: 5, active_jobs: 1, storage_used_mb: 256 },
    isLoading: false,
  }),
  useHealthDetailed: () => ({
    data: {
      status: 'healthy',
      checks: {
        database: { status: 'ok', latency_ms: 1 },
        redis: { status: 'ok', latency_ms: 1 },
        disk: { status: 'ok', free_gb: 100 },
        storage: { status: 'ok' },
      },
      version: '2.1.0',
    },
    isLoading: false,
  }),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

const goesStatsWithJobs = {
  total_frames: 100,
  frames_by_satellite: { 'GOES-19': 100 },
  last_fetch_time: '2026-01-01T00:00:00Z',
  active_schedules: 2,
  recent_jobs: [
    { id: '1', status: 'completed', created_at: '2026-01-01T00:00:00Z', status_message: 'Done' },
    { id: '2', status: 'running', created_at: '2026-01-01T01:00:00Z', status_message: 'In progress' },
    { id: '3', status: 'failed', created_at: '2026-01-01T02:00:00Z', status_message: 'Error' },
    { id: '4', status: 'pending', created_at: '2026-01-01T03:00:00Z', status_message: 'Waiting' },
  ],
  storage_by_satellite: { 'GOES-19': 1024 },
  storage_by_band: { C02: 512 },
};

function makeWrapper(goesStats?: typeof goesStatsWithJobs) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (goesStats) {
      qc.setQueryData(['goes-dashboard-stats'], goesStats);
    }
    return (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Dashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<Dashboard />, { wrapper });
    expect(container).toBeTruthy();
  });

  it('renders stat cards with data values visible', () => {
    const { container } = render(<Dashboard />, { wrapper });
    const text = container.textContent || '';
    expect(text.length).toBeGreaterThan(0);
    expect(text).toContain('10');
  });

  it('renders stat cards section (Total Images, Total Jobs, Active Jobs)', () => {
    const { getByText } = render(<Dashboard />, { wrapper });
    expect(getByText('Total Images')).toBeTruthy();
    expect(getByText('Total Jobs')).toBeTruthy();
    expect(getByText('Active Jobs')).toBeTruthy();
  });

  it('stat cards grid is not hidden when data is loaded', () => {
    const { getByText } = render(<Dashboard />, { wrapper });
    const totalImagesEl = getByText('Total Images');
    const grid = totalImagesEl.closest('[class*="grid"]');
    expect(grid).toBeTruthy();
    expect(grid!.className).not.toContain('hidden');
  });

  it('renders recent jobs with correct status color indicators', () => {
    const W = makeWrapper(goesStatsWithJobs);
    const { container } = render(<Dashboard />, { wrapper: W });
    // Check that status dots are rendered with correct classes
    const dots = container.querySelectorAll('.rounded-full');
    const dotClasses = Array.from(dots).map((d) => d.className);
    // Should have emerald for completed, amber for running, red for failed, slate for pending
    expect(dotClasses.some((c) => c.includes('bg-emerald-400'))).toBe(true);
    expect(dotClasses.some((c) => c.includes('bg-amber-400'))).toBe(true);
    expect(dotClasses.some((c) => c.includes('bg-red-400'))).toBe(true);
    expect(dotClasses.some((c) => c.includes('bg-slate-400'))).toBe(true);
  });

  it('renders recent job status messages', () => {
    const W = makeWrapper(goesStatsWithJobs);
    const { container } = render(<Dashboard />, { wrapper: W });
    const text = container.textContent || '';
    expect(text).toContain('Done');
    expect(text).toContain('In progress');
    expect(text).toContain('Error');
    expect(text).toContain('Waiting');
  });

  it('job cards have dark-mode-compatible background classes', () => {
    const { container } = render(<Dashboard />, { wrapper });
    const jobListSection = container.querySelector('.space-y-2');
    if (jobListSection) {
      const cards = jobListSection.querySelectorAll('button');
      cards.forEach((card) => {
        const cls = card.className;
        expect(cls).toMatch(/dark:bg-/);
      });
    }
  });
});
