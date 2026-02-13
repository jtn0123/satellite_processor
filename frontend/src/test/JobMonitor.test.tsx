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

vi.mock('../hooks/useApi', () => ({
  useJob: (id: string) => ({
    data: id === 'completed-job' ? completedJob : mockJob,
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
    expect(screen.getByText('Job job-abc-')).toBeInTheDocument();
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
});
