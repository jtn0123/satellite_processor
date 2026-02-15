import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../hooks/useApi', () => ({
  useJobs: vi.fn(() => ({
    data: [
      { id: 'j1', job_type: 'goes_fetch', status: 'completed', progress: 100, status_message: 'Done', created_at: '2026-01-01T12:00:00Z' },
      { id: 'j2', job_type: 'animation', status: 'processing', progress: 50, status_message: 'Working', created_at: '2026-01-01T11:00:00Z' },
    ],
    isLoading: false,
  })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

import JobList from '../components/Jobs/JobList';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('JobList', () => {
  it('renders job list with status messages', () => {
    renderWithQuery(<JobList />);
    expect(screen.getByText('Done')).toBeInTheDocument();
    expect(screen.getByText('Working')).toBeInTheDocument();
  });
});
