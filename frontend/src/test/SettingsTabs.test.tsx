import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../pages/Settings';

vi.mock('../hooks/useApi', () => ({
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

function renderSettings(initialRoute = '/settings') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Settings tabs', () => {
  it('renders 3 tab buttons', () => {
    renderSettings();
    const tablist = screen.getByRole('tablist');
    expect(tablist).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Config tab' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Data tab' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'System tab' })).toBeTruthy();
  });

  it('defaults to Config tab showing Processing Defaults', () => {
    renderSettings();
    expect(screen.getByRole('tab', { name: 'Config tab' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Processing Defaults')).toBeTruthy();
  });

  it('switches to Data tab on click', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Data tab' }));
    expect(screen.getByRole('tab', { name: 'Data tab' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Cleanup Rules')).toBeTruthy();
  });

  it('switches to System tab on click', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'System tab' }));
    expect(screen.getByRole('tab', { name: 'System tab' }).getAttribute('aria-selected')).toBe('true');
  });

  it('Config tab is not selected when switching to Data', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Data tab' }));
    expect(screen.getByRole('tab', { name: 'Config tab' }).getAttribute('aria-selected')).toBe('false');
  });
});
