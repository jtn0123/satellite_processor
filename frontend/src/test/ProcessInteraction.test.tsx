import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));

vi.mock('../hooks/useApi', () => ({
  useImages: vi.fn(() => ({
    data: [
      { id: 'img-1', filename: 'test1.nc', path: '/tmp/test1.nc', satellite: 'GOES-16', band: 'C02', created_at: '2024-01-01' },
      { id: 'img-2', filename: 'test2.nc', path: '/tmp/test2.nc', satellite: 'GOES-16', band: 'C13', created_at: '2024-01-02' },
    ],
    isLoading: false,
  })),
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

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Process /></MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Process page - with images interactions', () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it('renders heading and description', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: /process images/i })).toBeInTheDocument();
    expect(screen.getByText(/select images and configure processing parameters/i)).toBeInTheDocument();
  });

  it('shows Select Images heading with count when images exist', () => {
    renderPage();
    expect(screen.getByText('Select Images')).toBeInTheDocument();
    expect(screen.getByText(/0 selected/)).toBeInTheDocument();
  });

  it('does not show empty state when images exist', () => {
    renderPage();
    expect(screen.queryByText('No images yet')).not.toBeInTheDocument();
  });

  it('does not show processing form when nothing selected', () => {
    renderPage();
    expect(screen.queryByText('Configure Processing')).not.toBeInTheDocument();
    expect(screen.queryByText('Presets')).not.toBeInTheDocument();
  });

  it('does not show clear selection initially', () => {
    renderPage();
    expect(screen.queryByText(/clear selection/i)).not.toBeInTheDocument();
  });

  it('renders ImageGallery component', () => {
    const { container } = renderPage();
    // ImageGallery should render some content for the images
    expect(container.querySelector('.space-y-8')).toBeInTheDocument();
  });
});

// Empty state tests covered by ProcessCoverage.test.tsx
