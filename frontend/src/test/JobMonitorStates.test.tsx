import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import JobMonitor from '../components/Jobs/JobMonitor';

const baseJob = {
  id: 'job-test-123',
  job_type: 'goes_fetch',
  created_at: '2026-01-01T00:00:00Z',
  params: { satellite: 'GOES-16', sector: 'FullDisk', band: 'C02' },
};

const jobs: Record<string, object> = {
  pending: { ...baseJob, status: 'pending', progress: 0, status_message: 'Queued' },
  processing: { ...baseJob, status: 'processing', progress: 45, status_message: 'Downloading...', started_at: '2026-01-01T00:01:00Z' },
  completed: { ...baseJob, status: 'completed', progress: 100, output_path: '/out', completed_at: '2026-01-01T00:05:00Z', started_at: '2026-01-01T00:01:00Z' },
  completed_partial: { ...baseJob, status: 'completed_partial', progress: 100, output_path: '/out', status_message: 'Fetched 150 of 300', completed_at: '2026-01-01T00:05:00Z', started_at: '2026-01-01T00:01:00Z' },
  failed: { ...baseJob, status: 'failed', progress: 0, error: 'S3 timeout', completed_at: '2026-01-01T00:02:00Z', started_at: '2026-01-01T00:01:00Z' },
  cancelled: { ...baseJob, status: 'cancelled', progress: 30, completed_at: '2026-01-01T00:03:00Z', started_at: '2026-01-01T00:01:00Z' },
};

vi.mock('../hooks/useApi', () => ({
  useJob: (id: string) => {
    const key = id.replace('job-', '');
    return { data: jobs[key] ?? jobs['pending'], isLoading: false, refetch: vi.fn() };
  },
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ data: null, connected: true, logs: [] }),
}));

vi.mock('../components/VideoPlayer/VideoPlayer', () => ({
  default: () => <div data-testid="video-player">VideoPlayer</div>,
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('JobMonitor states', () => {
  it('shows Cancel for pending job', () => {
    render(<JobMonitor jobId="job-pending" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
  });

  it('shows Cancel for processing job', () => {
    render(<JobMonitor jobId="job-processing" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Cancel')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('shows Download for completed job', () => {
    render(<JobMonitor jobId="job-completed" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Download Output')).toBeInTheDocument();
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
  });

  it('shows Download for completed_partial job', () => {
    render(<JobMonitor jobId="job-completed_partial" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Download Output')).toBeInTheDocument();
    expect(screen.getByText('completed_partial')).toBeInTheDocument();
  });

  it('shows Retry and error for failed job', () => {
    render(<JobMonitor jobId="job-failed" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('S3 timeout')).toBeInTheDocument();
  });

  it('shows no Cancel/Retry for cancelled job', () => {
    render(<JobMonitor jobId="job-cancelled" onBack={vi.fn()} />, { wrapper });
    expect(screen.queryByText('Cancel')).not.toBeInTheDocument();
    expect(screen.queryByText('Retry')).not.toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows Live indicator when connected', () => {
    render(<JobMonitor jobId="job-processing" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Live')).toBeInTheDocument();
  });

  it('renders parameters', () => {
    render(<JobMonitor jobId="job-processing" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Job Parameters')).toBeInTheDocument();
    expect(screen.getByText('GOES-16')).toBeInTheDocument();
  });

  it('renders timeline', () => {
    render(<JobMonitor jobId="job-completed" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Timeline')).toBeInTheDocument();
    expect(screen.getByText('Created')).toBeInTheDocument();
    expect(screen.getByText('Completed')).toBeInTheDocument();
  });

  it('renders Logs section', () => {
    render(<JobMonitor jobId="job-processing" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Logs')).toBeInTheDocument();
  });
});
