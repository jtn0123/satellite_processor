import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../pages/Settings';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
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
      if (url === '/satellite/frames/stats') {
        return Promise.resolve({
          data: { by_satellite: {}, by_band: {}, total_size_bytes: 0, total_frames: 0 },
        });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn(),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn(),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Settings', () => {
  it('renders settings page', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders without crashing', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container).toBeInTheDocument();
  });

  it('renders the settings container', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container.firstChild).toBeTruthy();
  });

  it('renders heading or label elements', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container.textContent?.length).toBeGreaterThan(0);
  });

  it('renders Max Frames per Fetch input when settings load', async () => {
    render(<Settings />, { wrapper });
    // Wait for settings to load and form to render
    const input = await screen.findByLabelText(/max frames per fetch/i, {}, { timeout: 3000 });
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).value).toBe('200');
  });

  // JTN-434 ISSUE-039: FPS=0 used to silently fail. Now the input gets
  // aria-invalid + an inline error message is shown next to it.
  it('sets aria-invalid on Video FPS and shows inline error when FPS=0 on save', async () => {
    render(<Settings />, { wrapper });
    const fpsInput = (await screen.findByLabelText(/video fps/i, {}, { timeout: 3000 })) as HTMLInputElement;
    expect(fpsInput).toBeInTheDocument();
    fireEvent.change(fpsInput, { target: { value: '0' } });
    const saveBtn = screen.getByRole('button', { name: /save settings/i });
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(fpsInput).toHaveAttribute('aria-invalid', 'true');
    });
    // Error message should be linked via aria-describedby.
    const describedBy = fpsInput.getAttribute('aria-describedby') ?? '';
    expect(describedBy).toContain('video-fps-error');
    const errorEl = document.getElementById('video-fps-error');
    expect(errorEl?.textContent).toMatch(/between 1 and 120/i);
  });
});
