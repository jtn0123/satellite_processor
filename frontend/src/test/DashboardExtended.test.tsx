import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../hooks/useApi', () => ({
  useImages: () => ({ data: [], isLoading: false }),
  useJobs: () => ({ data: [], isLoading: false, error: null }),
  useSystemStatus: () => ({
    data: { cpu_percent: 10, memory: { total: 16e9, available: 12e9, percent: 25 }, disk: { total: 500e9, free: 400e9, percent: 20 } },
    isLoading: false,
  }),
  useStats: () => ({
    data: { total_images: 0, total_jobs: 5, active_jobs: 1, storage: { used: 1e9, total: 10e9 } },
    isLoading: false, isError: false,
  }),
  useHealthDetailed: () => ({
    data: {
      status: 'healthy',
      checks: {
        database: { status: 'ok', latency_ms: 2 },
        redis: { status: 'ok', latency_ms: 1 },
        disk: { status: 'ok', free_gb: 400 },
      },
    },
  }),
}));

vi.mock('../api/client', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { total_frames: 0, frames_by_satellite: {}, last_fetch_time: null, active_schedules: 0, recent_jobs: [], storage_by_satellite: {}, storage_by_band: {} } }) },
}));

vi.mock('../components/Jobs/JobList', () => ({ default: () => <div data-testid="job-list">JobList</div> }));

const qc = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const renderDashboard = () => render(
  <QueryClientProvider client={qc()}>
    <MemoryRouter><Dashboard /></MemoryRouter>
  </QueryClientProvider>
);

describe('Dashboard extended', () => {
  beforeEach(() => mockNavigate.mockClear());

  it('renders Dashboard heading', () => {
    renderDashboard();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
  });

  it('shows onboarding when no images and no GOES frames', () => {
    renderDashboard();
    expect(screen.getByText('Get Started')).toBeInTheDocument();
  });

  it('shows Fetch Now button in onboarding', () => {
    renderDashboard();
    expect(screen.getByLabelText('Fetch satellite data now')).toBeInTheDocument();
  });

  it('navigates to /goes on Fetch Now click', () => {
    renderDashboard();
    fireEvent.click(screen.getByLabelText('Fetch satellite data now'));
    expect(mockNavigate).toHaveBeenCalledWith('/goes');
  });

  it('navigates to /goes on Browse & Fetch click', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Browse & Fetch'));
    expect(mockNavigate).toHaveBeenCalledWith('/goes');
  });

  it('navigates to /animate on Create Animation click', () => {
    renderDashboard();
    fireEvent.click(screen.getByText('Create Animation'));
    expect(mockNavigate).toHaveBeenCalledWith('/animate');
  });

  it('shows stat cards', () => {
    renderDashboard();
    expect(screen.getByText('GOES Frames')).toBeInTheDocument();
    expect(screen.getByText('Total Jobs')).toBeInTheDocument();
    expect(screen.getByText('Active Jobs')).toBeInTheDocument();
  });

  it('shows storage percentage', () => {
    renderDashboard();
    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('renders System Health section', () => {
    renderDashboard();
    expect(screen.getByText('System Health')).toBeInTheDocument();
  });

  it('shows healthy status', () => {
    renderDashboard();
    expect(screen.getByText('healthy')).toBeInTheDocument();
  });

  it('renders JobList component', () => {
    renderDashboard();
    expect(screen.getByTestId('job-list')).toBeInTheDocument();
  });

  it('shows health check labels', () => {
    renderDashboard();
    expect(screen.getByText('Database')).toBeInTheDocument();
    expect(screen.getByText('Redis')).toBeInTheDocument();
    expect(screen.getByText('Disk')).toBeInTheDocument();
  });

  it('renders View Live quick-link', () => {
    renderDashboard();
    expect(screen.getByText('View Live')).toBeInTheDocument();
  });
});
