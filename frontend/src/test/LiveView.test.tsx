import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('../hooks/useApi', () => ({
  useGoesImages: vi.fn(() => ({ data: [], isLoading: false })),
  useFetchStatus: vi.fn(() => ({ data: null })),
  useSettings: vi.fn(() => ({ data: {} })),
  useUpdateSettings: vi.fn(() => ({ mutate: vi.fn() })),
  useImages: vi.fn(() => ({ data: [] })),
  useJobs: vi.fn(() => ({ data: [] })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  usePresets: vi.fn(() => ({ data: [] })),
  useCreateJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));
vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));
vi.mock('../hooks/useWebSocket', () => ({ default: vi.fn(() => null) }));
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import LiveView from '../pages/LiveView';

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('LiveView page', () => {
  it('renders heading', () => {
    renderWithProviders(<LiveView />);
    expect(screen.getByRole('heading', { name: /^live$/i })).toBeInTheDocument();
  });

  it('renders breadcrumb with Home link', () => {
    renderWithProviders(<LiveView />);
    expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
  });

  it('renders breadcrumb current page', () => {
    renderWithProviders(<LiveView />);
    const nav = screen.getByRole('navigation');
    expect(nav).toHaveTextContent('Live');
  });

  it('breadcrumb nav has aria-label', () => {
    renderWithProviders(<LiveView />);
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' })).toBeInTheDocument();
  });

  it('current page span has aria-current="page"', () => {
    renderWithProviders(<LiveView />);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    const current = nav.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current!.textContent).toBe('Live');
  });
});
