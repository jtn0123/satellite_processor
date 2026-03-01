import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import SettingsPage from '../pages/Settings';

vi.mock('../hooks/useApi', () => ({
  useSettings: () => ({
    data: { default_false_color: 'vegetation', timestamp_enabled: true, timestamp_position: 'bottom-left', video_fps: 24, video_codec: 'h264', max_frames_per_fetch: 200, video_quality: 23 },
    isLoading: false,
  }),
  useUpdateSettings: () => ({ mutate: vi.fn(), isPending: false }),
  useSystemStatus: () => ({ data: null, isLoading: false }),
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
  it('renders 3 tab buttons in a tablist', () => {
    renderSettings();
    const tablist = screen.getByRole('tablist', { name: 'Settings tabs' });
    expect(tablist).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Config tab' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Data tab' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'System tab' })).toBeTruthy();
  });

  it('defaults to Config tab showing Processing Defaults and About', () => {
    renderSettings();
    expect(screen.getByRole('tab', { name: 'Config tab' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Processing Defaults')).toBeTruthy();
    expect(screen.getByText('About')).toBeTruthy();
  });

  it('switches to Data tab showing collapsible sections', async () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Data tab' }));
    expect(screen.getByRole('tab', { name: 'Data tab' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => {
      expect(screen.getByText('Cleanup Rules')).toBeTruthy();
    });
    expect(screen.getByText('Composites')).toBeTruthy();
    expect(screen.getByText('Manual Upload')).toBeTruthy();
    expect(screen.getByText('Processing')).toBeTruthy();
  });

  it('switches to System tab on click', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'System tab' }));
    expect(screen.getByRole('tab', { name: 'System tab' }).getAttribute('aria-selected')).toBe('true');
  });

  it('hides Config content when switching to Data tab', async () => {
    renderSettings();
    expect(screen.getByText('Processing Defaults')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Data tab' }));
    await waitFor(() => {
      expect(screen.queryByText('Processing Defaults')).toBeNull();
    });
  });

  it('Config tab deselected when Data tab active', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('tab', { name: 'Data tab' }));
    expect(screen.getByRole('tab', { name: 'Config tab' }).getAttribute('aria-selected')).toBe('false');
  });

  it('renders breadcrumb with Home and Settings', () => {
    renderSettings();
    const nav = screen.getByLabelText('Breadcrumb');
    expect(nav).toBeTruthy();
    expect(nav.querySelector('a')?.textContent).toBe('Home');
    expect(nav.querySelector('[aria-current="page"]')?.textContent).toBe('Settings');
  });
});
