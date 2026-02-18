import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import JobMonitor from '../components/Jobs/JobMonitor';

const mockShowToast = vi.fn();

const mockJob = {
  id: 'job-err-test',
  status: 'processing',
  job_type: 'goes_fetch',
  progress: 50,
  status_message: 'Working...',
  created_at: '2026-01-01T00:00:00Z',
  started_at: '2026-01-01T00:00:01Z',
  params: { satellite: 'GOES-19' },
};

const failedJob = {
  ...mockJob,
  id: 'job-failed',
  status: 'failed',
  progress: 0,
  error: 'Download timeout',
  completed_at: '2026-01-01T00:05:00Z',
};

vi.mock('../hooks/useApi', () => ({
  useJob: (id: string) => ({
    data: id === 'job-failed' ? failedJob : mockJob,
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock('../hooks/useWebSocket', () => ({
  useWebSocket: () => ({ data: null, connected: false, logs: [] }),
}));

vi.mock('../components/VideoPlayer/VideoPlayer', () => ({
  default: () => <div data-testid="video-player">VideoPlayer</div>,
}));

vi.mock('../utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../api/client';
const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

function renderMonitor(jobId = 'job-err-test') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JobMonitor jobId={jobId} onBack={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockResolvedValue({ data: [] });
  mockedApi.delete.mockRejectedValue(new Error('Server error'));
  mockedApi.post.mockRejectedValue(new Error('Server error'));
});

describe('JobMonitorErrors', () => {
  it('clipboard copy failure shows toast', async () => {
    // Mock clipboard to fail
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('Permission denied')) },
      writable: true,
      configurable: true,
    });

    renderMonitor();
    const copyBtn = screen.getByTitle('Copy Job ID');
    fireEvent.click(copyBtn);
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to copy job ID to clipboard');
    });

    Object.defineProperty(navigator, 'clipboard', { value: originalClipboard, writable: true, configurable: true });
  });

  it('job delete failure shows toast', async () => {
    mockedApi.delete.mockRejectedValue(new Error('Delete failed'));
    renderMonitor();
    fireEvent.click(screen.getByText('Delete'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to delete job');
    });
  });

  it('job cancel failure shows toast', async () => {
    mockedApi.delete.mockRejectedValue(new Error('Cancel failed'));
    renderMonitor();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to cancel job');
    });
  });

  it('job retry failure shows toast', async () => {
    mockedApi.post.mockRejectedValue(new Error('Retry failed'));
    renderMonitor('job-failed');
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to retry job');
    });
  });

  it('log loading failure shows toast', async () => {
    mockedApi.get.mockRejectedValue(new Error('Logs unavailable'));
    renderMonitor();
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to load job logs');
    });
  });
});
