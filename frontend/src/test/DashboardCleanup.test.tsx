import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Dashboard from '../pages/Dashboard';

vi.mock('../hooks/useApi', () => ({
  useImages: () => ({ data: [], isLoading: false }),
  useJobs: () => ({ data: [], isLoading: false, error: null }),
  useSystemStatus: () => ({ data: null, isLoading: false }),
  useDeleteJob: () => ({ mutate: vi.fn() }),
  useStats: () => ({
    data: { total_images: 0, total_jobs: 0, active_jobs: 0, storage: { used: 0, total: 1 } },
    isLoading: false,
  }),
  useHealthDetailed: () => ({
    data: { status: 'healthy', checks: {} },
    isLoading: false,
  }),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: { total_frames: 0, frames_by_satellite: {}, last_fetch_time: null, active_schedules: 0, recent_jobs: [], storage_by_satellite: {}, storage_by_band: {} },
    }),
    post: vi.fn().mockResolvedValue({ data: { job_id: 'test' } }),
  },
}));

function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Dashboard cleanup — unified onboarding', () => {
  it('shows single "Get Started" heading when no images', async () => {
    renderDashboard();
    const headings = await screen.findAllByText('Get Started');
    expect(headings).toHaveLength(1);
  });

  it('does not show "Getting Started" heading', () => {
    renderDashboard();
    expect(screen.queryByText('Getting Started')).toBeNull();
  });

  it('does not render a standalone "View Live" card link', () => {
    renderDashboard();
    // The old View Live card had a <p> with "View Live" text outside onboarding
    const viewLiveElements = screen.queryAllByText('View Live');
    // Should not have a standalone card — only nav links if any
    expect(viewLiveElements).toHaveLength(0);
  });
});
