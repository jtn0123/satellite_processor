import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

vi.mock('../hooks/useApi', () => ({
  useImages: vi.fn(() => ({ data: [], isLoading: false })),
  useJobs: vi.fn(() => ({ data: [], isLoading: false })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  usePresets: vi.fn(() => ({ data: [], isLoading: false })),
  useCreateJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import Process from '../pages/Process';
import { useImages } from '../hooks/useApi';

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Process page - empty state', () => {
  it('shows upload link when no images', () => {
    renderPage(<Process />);
    expect(screen.getByText('No images yet')).toBeInTheDocument();
    const uploadLink = screen.getByRole('link', { name: /upload images/i });
    expect(uploadLink).toHaveAttribute('href', '/upload');
  });

  it('shows helpful description', () => {
    renderPage(<Process />);
    expect(screen.getByText(/upload some satellite images/i)).toBeInTheDocument();
  });
});

describe('Process page - with images', () => {
  beforeEach(() => {
    vi.mocked(useImages).mockReturnValue({
      data: [
        { id: 'img-1', filename: 'test1.nc', path: '/tmp/test1.nc' },
        { id: 'img-2', filename: 'test2.nc', path: '/tmp/test2.nc' },
      ],
      isLoading: false,
    } as ReturnType<typeof useImages>);
  });

  it('shows Select Images heading', () => {
    renderPage(<Process />);
    expect(screen.getByText('Select Images')).toBeInTheDocument();
  });

  it('shows selected count', () => {
    renderPage(<Process />);
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });

  it('does not show empty state', () => {
    renderPage(<Process />);
    expect(screen.queryByText('No images yet')).not.toBeInTheDocument();
  });

  it('does not show processing form when nothing selected', () => {
    renderPage(<Process />);
    expect(screen.queryByText('Configure Processing')).not.toBeInTheDocument();
  });
});

describe('Process page - subtitle', () => {
  it('shows configuration description', () => {
    renderPage(<Process />);
    expect(screen.getByText(/select images and configure processing parameters/i)).toBeInTheDocument();
  });
});
