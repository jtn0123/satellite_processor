import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('../hooks/useApi', () => ({
  useSystemStatus: vi.fn(() => ({ data: null })),
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

import Settings from '../pages/Settings';

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Settings collapsible sections', () => {
  it('renders all collapsible section buttons', () => {
    renderSettings();
    const buttons = screen.getAllByRole('button', { expanded: false });
    const sectionNames = ['Composites', 'Manual Upload', 'Processing'];
    for (const name of sectionNames) {
      const btn = buttons.find((b) => b.textContent?.includes(name));
      expect(btn).toBeTruthy();
    }
  });

  it('renders Cleanup Rules as open by default', () => {
    renderSettings();
    const cleanupBtn = screen.getByRole('button', { name: /cleanup rules/i });
    expect(cleanupBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('collapsible sections have correct initial aria-expanded state', () => {
    renderSettings();
    // Cleanup Rules is defaultOpen
    const cleanupBtn = screen.getByRole('button', { name: /cleanup rules/i });
    expect(cleanupBtn).toHaveAttribute('aria-expanded', 'true');
    // Others are collapsed by default
    const compositesBtn = screen.getByRole('button', { name: /composites/i });
    expect(compositesBtn).toHaveAttribute('aria-expanded', 'false');
    const uploadBtn = screen.getByRole('button', { name: /manual upload/i });
    expect(uploadBtn).toHaveAttribute('aria-expanded', 'false');
    const processingBtn = screen.getByRole('button', { name: /processing/i });
    expect(processingBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('renders Settings heading', () => {
    renderSettings();
    expect(screen.getByRole('heading', { name: /settings/i })).toBeInTheDocument();
  });

  it('renders System Resources section', () => {
    renderSettings();
    expect(screen.getByText(/system resources/i)).toBeInTheDocument();
  });
});
