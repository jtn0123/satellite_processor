import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockGet = vi.hoisted(() => vi.fn());
const mockPut = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    put: mockPut,
    delete: vi.fn(),
  },
}));

import Settings from '../pages/Settings';

const SETTINGS_DATA = {
  default_false_color: 'vegetation',
  timestamp_enabled: true,
  timestamp_position: 'bottom-left',
  video_fps: 24,
  video_codec: 'h264',
  max_frames_per_fetch: 200,
  video_quality: 23,
};

const STORAGE_DATA = {
  by_satellite: {
    'GOES-19': { count: 100, size: 500_000_000 },
    'GOES-18': { count: 50, size: 200_000_000 },
  },
  by_band: {
    C02: { count: 80, size: 300_000_000 },
    C13: { count: 70, size: 400_000_000 },
  },
  total_size_bytes: 700_000_000,
  total_frames: 150,
};

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function setupLoadedMocks(storage = STORAGE_DATA) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/settings') return Promise.resolve({ data: SETTINGS_DATA });
    if (url === '/goes/frames/stats') return Promise.resolve({ data: storage });
    return Promise.resolve({ data: {} });
  });
  mockPut.mockResolvedValue({ data: SETTINGS_DATA });
}

describe('Settings - form interactions', () => {
  beforeEach(() => {
    setupLoadedMocks();
  });

  it('changes false color dropdown', async () => {
    render(<Settings />, { wrapper });
    const select = await screen.findByLabelText(/default false color/i, {}, { timeout: 3000 });
    fireEvent.change(select, { target: { value: 'fire' } });
    expect((select as HTMLSelectElement).value).toBe('fire');
  });

  it('toggles timestamp checkbox', async () => {
    render(<Settings />, { wrapper });
    const checkbox = await screen.findByLabelText(/timestamp enabled/i, {}, { timeout: 3000 });
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(false);
  });

  it('changes timestamp position', async () => {
    render(<Settings />, { wrapper });
    const select = await screen.findByLabelText(/timestamp position/i, {}, { timeout: 3000 });
    fireEvent.change(select, { target: { value: 'top-right' } });
    expect((select as HTMLSelectElement).value).toBe('top-right');
  });

  it('changes video FPS', async () => {
    render(<Settings />, { wrapper });
    const input = await screen.findByLabelText(/video fps/i, {}, { timeout: 3000 });
    fireEvent.change(input, { target: { value: '30' } });
    expect((input as HTMLInputElement).value).toBe('30');
  });

  it('changes video codec', async () => {
    render(<Settings />, { wrapper });
    const select = await screen.findByLabelText(/video codec/i, {}, { timeout: 3000 });
    fireEvent.change(select, { target: { value: 'hevc' } });
    expect((select as HTMLSelectElement).value).toBe('hevc');
  });

  it('changes max frames per fetch', async () => {
    render(<Settings />, { wrapper });
    const input = await screen.findByLabelText(/max frames per fetch/i, {}, { timeout: 3000 });
    fireEvent.change(input, { target: { value: '500' } });
    expect((input as HTMLInputElement).value).toBe('500');
  });

  it('changes video quality', async () => {
    render(<Settings />, { wrapper });
    const input = await screen.findByLabelText(/video quality/i, {}, { timeout: 3000 });
    fireEvent.change(input, { target: { value: '18' } });
    expect((input as HTMLInputElement).value).toBe('18');
  });

  it('saves settings successfully and shows toast', async () => {
    render(<Settings />, { wrapper });
    const saveBtn = await screen.findByText('Save Settings', {}, { timeout: 3000 });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText('Settings saved successfully.')).toBeInTheDocument();
    });
  });

  it('shows error toast on save failure', async () => {
    mockPut.mockRejectedValueOnce(new Error('fail'));
    render(<Settings />, { wrapper });
    const saveBtn = await screen.findByText('Save Settings', {}, { timeout: 3000 });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(screen.getByText('Failed to save settings. Please try again.')).toBeInTheDocument();
    });
  });
});

describe('Settings - storage section with data (System tab)', () => {
  beforeEach(() => {
    setupLoadedMocks();
  });

  it('renders satellite breakdown bars', async () => {
    render(<Settings />, { wrapper });
    fireEvent.click(await screen.findByRole('tab', { name: 'System tab' }));
    await waitFor(() => {
      expect(screen.getByText('GOES-19')).toBeInTheDocument();
      expect(screen.getByText('GOES-18')).toBeInTheDocument();
    });
  });

  it('renders band table', async () => {
    render(<Settings />, { wrapper });
    fireEvent.click(await screen.findByRole('tab', { name: 'System tab' }));
    await waitFor(() => {
      expect(screen.getByText('C02')).toBeInTheDocument();
      expect(screen.getByText('C13')).toBeInTheDocument();
    });
  });

  it('shows total frames and size', async () => {
    render(<Settings />, { wrapper });
    fireEvent.click(await screen.findByRole('tab', { name: 'System tab' }));
    await waitFor(() => {
      expect(screen.getByText(/150/)).toBeInTheDocument();
    });
  });
});

describe('Settings - storage section empty (System tab)', () => {
  it('does not render satellite section when empty', async () => {
    setupLoadedMocks({ by_satellite: {}, by_band: {}, total_size_bytes: 0, total_frames: 0 } as typeof STORAGE_DATA);
    render(<Settings />, { wrapper });
    fireEvent.click(await screen.findByRole('tab', { name: 'System tab' }));
    await waitFor(() => {
      expect(screen.getByText('Storage')).toBeInTheDocument();
    });
    expect(screen.queryByText('By Satellite')).not.toBeInTheDocument();
    expect(screen.queryByText('By Band')).not.toBeInTheDocument();
  });
});

describe('Settings - retry button', () => {
  it('retry button calls location.reload', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/settings') return Promise.reject(new Error('fail'));
      return Promise.resolve({ data: {} });
    });

    const reloadMock = vi.fn();
    Object.defineProperty(globalThis, 'location', {
      value: { reload: reloadMock },
      writable: true,
      configurable: true,
    });

    render(<Settings />, { wrapper });
    const retryBtn = await screen.findByText('Retry', {}, { timeout: 3000 });
    fireEvent.click(retryBtn);
    expect(reloadMock).toHaveBeenCalled();
  });
});
