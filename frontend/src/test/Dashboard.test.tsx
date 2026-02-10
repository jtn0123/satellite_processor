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
}));

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
});
