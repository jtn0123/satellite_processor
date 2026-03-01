import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import JobList from '../components/Jobs/JobList';

vi.mock('../hooks/useApi', () => ({
  useJobs: () => ({
    data: [
      { id: '1', status: 'completed', created_at: '2026-01-01T00:00:00Z', status_message: 'Done', progress: 100, type: 'fetch' },
      { id: '2', status: 'processing', created_at: '2026-01-01T01:00:00Z', status_message: 'Running', progress: 50, type: 'fetch' },
    ],
    isLoading: false,
    error: null,
  }),
  useDeleteJob: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function renderJobList() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <JobList onSelect={vi.fn()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Card styling consistency', () => {
  it('job list cards use rounded-xl', () => {
    const { container } = renderJobList();
    const buttons = container.querySelectorAll('button');
    const jobCards = Array.from(buttons).filter((b) => b.className.includes('rounded-xl'));
    expect(jobCards.length).toBeGreaterThan(0);
  });

  it('progress bar has light mode background', () => {
    const { container } = renderJobList();
    const progressBg = container.querySelector('.bg-gray-200.dark\\:bg-space-700');
    // The progress bar should have a light mode background class
    expect(progressBg ?? container.querySelector('[class*="bg-gray-200"]')).toBeTruthy();
  });
});
