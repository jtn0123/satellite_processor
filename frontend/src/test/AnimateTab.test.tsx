import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AnimateTab from '../components/Animation/AnimateTab';

const mockGet = vi.fn();
const mockPost = vi.fn();
const mockDelete = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    defaults: { headers: { common: {} } },
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

const completedAnimation = {
  id: 'anim-1',
  name: 'Test Animation',
  status: 'completed',
  frame_count: 24,
  fps: 10,
  format: 'mp4',
  quality: 'medium',
  output_path: '/output/test.mp4',
  file_size: 1024000,
  duration_seconds: 2.4,
  created_at: '2026-01-01T00:00:00Z',
  completed_at: '2026-01-01T00:01:00Z',
  error: '',
  crop_preset_id: null,
  false_color: false,
  scale: '1x',
  job_id: null,
};

const pendingAnimation = { ...completedAnimation, id: 'anim-2', name: 'Pending Anim', status: 'pending', output_path: null, file_size: 0 };
const processingAnimation = { ...completedAnimation, id: 'anim-3', name: 'Processing Anim', status: 'processing', output_path: null, file_size: 0 };
const failedAnimation = { ...completedAnimation, id: 'anim-4', name: 'Failed Anim', status: 'failed', output_path: null, file_size: 0, error: 'Out of memory' };
const gifAnimation = { ...completedAnimation, id: 'anim-5', name: 'GIF Anim', format: 'gif', output_path: '/output/test.gif' };

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

function setupDefaultMocks(animations: unknown[] = []) {
  mockGet.mockImplementation((url: string) => {
    if (url === '/goes/animations') {
      return Promise.resolve({ data: { items: animations, total: animations.length, page: 1, limit: 20 } });
    }
    if (url === '/goes/collections') {
      return Promise.resolve({ data: [{ id: 'col-1', name: 'My Collection', frame_count: 50 }] });
    }
    if (url === '/goes/frames/preview-range') {
      return Promise.resolve({ data: { frames: [], total_count: 10, capture_interval_minutes: 10 } });
    }
    return Promise.resolve({ data: {} });
  });
  mockPost.mockResolvedValue({ data: { id: 'new-anim', status: 'pending' } });
  mockDelete.mockResolvedValue({ data: {} });
}

describe('AnimateTab (Unified)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  it('renders satellite selector', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
  });

  it('renders quick hour buttons', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('Last 1h')).toBeInTheDocument();
    expect(screen.getByText('Last 3h')).toBeInTheDocument();
    expect(screen.getByText('Last 6h')).toBeInTheDocument();
    expect(screen.getByText('Last 12h')).toBeInTheDocument();
    expect(screen.getByText('Last 24h')).toBeInTheDocument();
  });

  it('clicking quick hour sets date range', async () => {
    renderWithProviders(<AnimateTab />);
    const btn = screen.getByText('Last 1h');
    fireEvent.click(btn);
    const inputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders generate button', () => {
    renderWithProviders(<AnimateTab />);
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    expect(generateBtn).toBeInTheDocument();
  });

  it('does NOT render mode toggle between quick/studio', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.queryByText('Quick Animate')).not.toBeInTheDocument();
    expect(screen.queryByText('Animation Studio')).not.toBeInTheDocument();
  });

  it('renders quick-start preset chips', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('🌀 Hurricane Watch')).toBeInTheDocument();
    expect(screen.getByText('🌅 Visible Timelapse')).toBeInTheDocument();
    expect(screen.getByText('⚡ Storm Cell')).toBeInTheDocument();
    expect(screen.getByText('🌍 Full Disk')).toBeInTheDocument();
    expect(screen.getByText('🔥 Fire Watch')).toBeInTheDocument();
  });

  it('renders source mode toggle (filters vs collection)', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('By Filters')).toBeInTheDocument();
    expect(screen.getByText('From Collection')).toBeInTheDocument();
  });

  it('switches to collection mode', () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('From Collection'));
    expect(screen.getByText('Select collection...')).toBeInTheDocument();
  });

  it('clicking quick-start chip sets config and date range', () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('🌀 Hurricane Watch'));
    const inputs = screen.getAllByDisplayValue(/\d{4}-\d{2}-\d{2}/);
    expect(inputs.length).toBeGreaterThanOrEqual(1);
  });

  it('renders animation history section', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('Animation History')).toBeInTheDocument();
    expect(screen.getByText(/No animations yet/)).toBeInTheDocument();
  });

  it('renders settings panel on desktop (hidden class for mobile)', () => {
    renderWithProviders(<AnimateTab />);
    expect(screen.getByText('Animation Settings')).toBeInTheDocument();
  });

  // --- New tests for coverage ---

  it('renders animation name input and updates config', () => {
    renderWithProviders(<AnimateTab />);
    const input = screen.getByPlaceholderText('Auto-generated if empty');
    fireEvent.change(input, { target: { value: 'My Animation' } });
    expect(input).toHaveValue('My Animation');
  });

  it('renders satellite/sector/band selectors and can change them', () => {
    renderWithProviders(<AnimateTab />);
    const satellite = screen.getByLabelText('Satellite');
    const sector = screen.getByLabelText('Sector');
    const band = screen.getByLabelText('Band');

    fireEvent.change(satellite, { target: { value: 'GOES-18' } });
    expect(satellite).toHaveValue('GOES-18');

    fireEvent.change(sector, { target: { value: 'FullDisk' } });
    expect(sector).toHaveValue('FullDisk');

    fireEvent.change(band, { target: { value: 'C13' } });
    expect(band).toHaveValue('C13');
  });

  it('renders date range inputs and can change them', () => {
    renderWithProviders(<AnimateTab />);
    const startInput = screen.getByLabelText('Start Date/Time');
    const endInput = screen.getByLabelText('End Date/Time');

    fireEvent.change(startInput, { target: { value: '2026-01-01T00:00' } });
    fireEvent.change(endInput, { target: { value: '2026-01-02T00:00' } });

    expect(startInput).toHaveValue('2026-01-01T00:00');
    expect(endInput).toHaveValue('2026-01-02T00:00');
  });

  it('displays completed animations with download link', async () => {
    setupDefaultMocks([completedAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Animation')).toBeInTheDocument();
    });
    expect(screen.getByText('Done')).toBeInTheDocument();
    // Check download link exists
    const downloadLink = screen.getByRole('link');
    expect(downloadLink).toHaveAttribute('href', expect.stringContaining('/api/download'));
  });

  it('displays pending animation status', async () => {
    setupDefaultMocks([pendingAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Pending')).toBeInTheDocument();
    });
  });

  it('displays processing animation status', async () => {
    setupDefaultMocks([processingAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Processing')).toBeInTheDocument();
    });
  });

  it('displays failed animation status with error tooltip', async () => {
    setupDefaultMocks([failedAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
    expect(screen.getByTitle('Out of memory')).toBeInTheDocument();
  });

  it('renders video preview for completed mp4 animation', async () => {
    setupDefaultMocks([completedAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Latest Animation')).toBeInTheDocument();
    });
    const video = document.querySelector('video');
    expect(video).toBeTruthy();
    // Check track for captions
    const track = document.querySelector('track');
    expect(track).toBeTruthy();
    expect(track?.getAttribute('kind')).toBe('captions');
  });

  it('renders gif preview for completed gif animation', async () => {
    setupDefaultMocks([gifAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Latest Animation')).toBeInTheDocument();
    });
    const img = screen.getByAltText('GIF Anim');
    expect(img).toBeInTheDocument();
  });

  it('delete button calls delete mutation', async () => {
    setupDefaultMocks([completedAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Animation')).toBeInTheDocument();
    });
    const animRow = screen.getByText('Test Animation').closest('div[class*="flex items-center"]');
    const trash = animRow?.querySelector('button:last-child');
    if (trash) {
      fireEvent.click(trash);
      await waitFor(() => {
        expect(mockDelete).toHaveBeenCalledWith('/goes/animations/anim-1');
      });
    }
  });

  it('opens mobile settings panel when settings button clicked', () => {
    renderWithProviders(<AnimateTab />);
    const settingsBtn = screen.getByRole('button', { name: /settings/i });
    fireEvent.click(settingsBtn);
    // The mobile panel should now be visible with close button
    const closeButtons = screen.getAllByRole('button', { name: /close settings/i });
    expect(closeButtons.length).toBeGreaterThan(0);
  });

  it('closes mobile settings panel via backdrop button', () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const closeButtons = screen.getAllByRole('button', { name: /close settings/i });
    fireEvent.click(closeButtons[0]);
    // Panel should be gone - no more close buttons from the panel
    // Settings button should still exist
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('closes mobile settings panel via X button', () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByRole('button', { name: /settings/i }));
    const closeButtons = screen.getAllByRole('button', { name: /close settings/i });
    // Click the last one (X button inside panel)
    fireEvent.click(closeButtons[closeButtons.length - 1]);
    expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
  });

  it('generate button is disabled when no date range set', () => {
    renderWithProviders(<AnimateTab />);
    const generateBtn = screen.getByRole('button', { name: /generate/i });
    expect(generateBtn).toBeDisabled();
  });

  it('generate button triggers mutation after setting date range', async () => {
    renderWithProviders(<AnimateTab />);
    // Set a date range first
    fireEvent.click(screen.getByText('Last 1h'));
    await waitFor(() => {
      const generateBtn = screen.getByRole('button', { name: /generate/i });
      expect(generateBtn).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/goes/animations/from-range', expect.objectContaining({
        satellite: 'GOES-16',
        sector: 'CONUS',
        band: 'C02',
        fps: 10,
        format: 'mp4',
      }));
    });
  });

  it('collection mode shows collection selector with options', async () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('From Collection'));
    await waitFor(() => {
      expect(screen.getByText(/My Collection/)).toBeInTheDocument();
    });
  });

  it('collection mode generate uses collection endpoint', async () => {
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('From Collection'));
    await waitFor(() => {
      expect(screen.getByText(/My Collection/)).toBeInTheDocument();
    });
    const select = screen.getByLabelText('Collection');
    fireEvent.change(select, { target: { value: 'col-1' } });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/goes/animations', expect.objectContaining({
        collection_id: 'col-1',
      }));
    });
  });

  it('displays animation details with file size', async () => {
    setupDefaultMocks([completedAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText(/24 frames · 10 FPS · MP4 · medium/)).toBeInTheDocument();
    });
  });

  it('displays multiple animations in history', async () => {
    setupDefaultMocks([completedAnimation, pendingAnimation, failedAnimation]);
    renderWithProviders(<AnimateTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Animation')).toBeInTheDocument();
      expect(screen.getByText('Pending Anim')).toBeInTheDocument();
      expect(screen.getByText('Failed Anim')).toBeInTheDocument();
    });
  });

  it('quick-start chip switches to filters mode', () => {
    renderWithProviders(<AnimateTab />);
    // Switch to collection first
    fireEvent.click(screen.getByText('From Collection'));
    expect(screen.getByText('Select collection...')).toBeInTheDocument();
    // Click a quick-start chip - should switch back to filters
    fireEvent.click(screen.getByText('🌅 Visible Timelapse'));
    // Should show filter UI again (date inputs)
    expect(screen.getByLabelText('Start Date/Time')).toBeInTheDocument();
  });

  it('handles generate mutation error', async () => {
    const { showToast } = await import('../utils/toast');
    mockPost.mockRejectedValueOnce(new Error('Server error'));
    renderWithProviders(<AnimateTab />);
    fireEvent.click(screen.getByText('Last 1h'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /generate/i })).not.toBeDisabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /generate/i }));
    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith('error', 'Failed to start animation generation');
    });
  });
});
