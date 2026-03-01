import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import JobsPage from '../pages/Jobs';
import SettingsPage from '../pages/Settings';

vi.mock('../hooks/useApi', () => ({
  useImages: () => ({ data: [], isLoading: false }),
  useJobs: () => ({ data: [], isLoading: false, error: null }),
  useSystemStatus: () => ({ data: null, isLoading: false }),
  useDeleteJob: () => ({ mutate: vi.fn() }),
  useStats: () => ({ data: null, isLoading: false }),
  useHealthDetailed: () => ({ data: null, isLoading: false }),
  useSettings: () => ({
    data: { default_false_color: 'vegetation', timestamp_enabled: true, timestamp_position: 'bottom-left', video_fps: 24, video_codec: 'h264', max_frames_per_fetch: 200, video_quality: 23 },
    isLoading: false,
  }),
  useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Jobs page breadcrumb', () => {
  it('renders breadcrumb with Home > Jobs', () => {
    wrap(<JobsPage />);
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Jobs')).toBeTruthy();
  });

  it('breadcrumb Home link points to /', () => {
    wrap(<JobsPage />);
    const link = screen.getByText('Home');
    expect(link.closest('a')?.getAttribute('href')).toBe('/');
  });
});

describe('Settings page breadcrumb', () => {
  it('renders breadcrumb with Home > Settings', () => {
    wrap(<SettingsPage />);
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeTruthy();
    expect(screen.getByText('Home')).toBeTruthy();
    expect(screen.getByText('Settings')).toBeTruthy();
  });
});
