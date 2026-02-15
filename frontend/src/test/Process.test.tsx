import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/useApi', () => ({
  useImages: vi.fn(() => ({ data: [], isLoading: false })),
  useJobs: vi.fn(() => ({ data: [], isLoading: false })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  usePresets: vi.fn(() => ({ data: [], isLoading: false })),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import Process from '../pages/Process';

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe('Process page', () => {
  it('renders the page', () => {
    renderPage(<Process />);
    expect(screen.getByText(/process images/i)).toBeInTheDocument();
  });
});
