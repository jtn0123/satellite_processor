import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import JobList from '../components/Jobs/JobList';

vi.mock('../hooks/useApi', () => ({
  useJobs: () => ({
    data: [
      {
        id: '1',
        status: 'completed',
        job_type: 'image_process',
        progress: 100,
        created_at: '2024-01-15T12:00:00Z',
        status_message: 'Done',
      },
    ],
    isLoading: false,
    error: null,
  }),
  useDeleteJob: () => ({
    mutate: vi.fn(),
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('JobList', () => {
  it('renders job entries', () => {
    render(<JobList />, { wrapper });
    expect(document.body.textContent).toContain('completed');
  });
});
