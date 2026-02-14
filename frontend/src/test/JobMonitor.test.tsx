import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import JobMonitor from '../components/Jobs/JobMonitor';

const mockJob = {
  id: 'job-abc-12345678',
  status: 'processing',
  job_type: 'image_process',
  progress: 45,
  status_message: 'Processing images...',
  created_at: '2026-01-01T00:00:00Z',
  params: {},
};

const completedJob = {
  ...mockJob,
  status: 'completed',
  progress: 100,
  output_path: '/output/job-abc',
};

const failedJob = {
  ...mockJob,
  status: 'failed',
  progress: 0,
  error: 'Something went wrong',
  completed_at: '2026-01-01T00:05:00Z',
};

vi.mock('../hooks/useApi', () => ({
  useJob: (id: string) => ({
    data: id === 'completed-job' ? completedJob : id === 'failed-job' ? failedJob : mockJob,
    isLoading: false,
  }),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ data: null, connected: false, logs: [] }),
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

describe('JobMonitor', () => {
  it('renders job details', () => {
    render(<JobMonitor jobId="job-abc-12345678" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('job-abc-12345678')).toBeInTheDocument();
  });

  it('renders progress bar', () => {
    render(<JobMonitor jobId="job-abc-12345678" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('renders status badge', () => {
    render(<JobMonitor jobId="job-abc-12345678" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('processing')).toBeInTheDocument();
  });

  it('shows download button when completed', () => {
    render(<JobMonitor jobId="completed-job" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Download Output')).toBeInTheDocument();
  });

  it('renders back button', () => {
    render(<JobMonitor jobId="job-abc-12345678" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Back to Jobs')).toBeInTheDocument();
  });

  it('shows Retry button for failed jobs', () => {
    // We need a failed job mock — use a special id
    render(<JobMonitor jobId="failed-job" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('shows error section for failed jobs', () => {
    render(<JobMonitor jobId="failed-job" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders Delete button', () => {
    render(<JobMonitor jobId="job-abc-12345678" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('renders Cancel button for processing jobs', () => {
    render(<JobMonitor jobId="job-abc-12345678" onBack={vi.fn()} />, { wrapper });
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });
});
