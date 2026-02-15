import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// We need separate test files or dynamic mocking. Use vi.hoisted for the mock control.
const mockGet = vi.hoisted(() => vi.fn());

vi.mock('../api/client', () => ({
  default: {
    get: mockGet,
    post: vi.fn(),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn(),
  },
}));

import Settings from '../pages/Settings';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Settings - loading skeleton', () => {
  it('renders skeleton with sr-only loading text', () => {
    mockGet.mockImplementation(() => new Promise(() => {}));
    render(<Settings />, { wrapper });
    expect(screen.getByText('Loading settings')).toBeInTheDocument();
    expect(document.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
  });
});

describe('Settings - error state', () => {
  it('renders error with retry button when settings fail', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/settings') return Promise.reject(new Error('fail'));
      return Promise.resolve({ data: {} });
    });

    render(<Settings />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText(/Failed to load settings/i)).toBeInTheDocument();
    }, { timeout: 3000 });
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });
});

describe('Settings - loaded form', () => {
  it('renders save button when settings loaded', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: {
            default_false_color: 'vegetation',
            timestamp_enabled: true,
            timestamp_position: 'bottom-left',
            video_fps: 24,
            video_codec: 'h264',
            max_frames_per_fetch: 200,
            video_quality: 23,
          },
        });
      }
      if (url === '/goes/stats') return Promise.resolve({ data: { by_satellite: {}, by_band: {}, total_size: 0, total_frames: 0 } });
      return Promise.resolve({ data: {} });
    });

    render(<Settings />, { wrapper });
    const saveBtn = await screen.findByText('Save Settings', {}, { timeout: 3000 });
    expect(saveBtn).toBeInTheDocument();
  });

  it('renders processing defaults section', async () => {
    mockGet.mockImplementation((url: string) => {
      if (url === '/settings') {
        return Promise.resolve({
          data: { default_false_color: 'vegetation', timestamp_enabled: true, timestamp_position: 'bottom-left', video_fps: 24, video_codec: 'h264', max_frames_per_fetch: 200, video_quality: 23 },
        });
      }
      if (url === '/goes/stats') return Promise.resolve({ data: { by_satellite: {}, by_band: {}, total_size: 0, total_frames: 0 } });
      return Promise.resolve({ data: {} });
    });

    render(<Settings />, { wrapper });
    await waitFor(() => {
      expect(screen.getByText('Processing Defaults')).toBeInTheDocument();
    });
  });
});
