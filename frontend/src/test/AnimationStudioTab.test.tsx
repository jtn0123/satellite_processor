import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import AnimationStudioTab from '../components/GoesData/AnimationStudioTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
    if (url === '/goes/collections') return Promise.resolve({ data: [] });
    if (url === '/goes/crop-presets') return Promise.resolve({ data: [] });
    if (url === '/goes/animations') return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 20 } });
    if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0, page: 1, limit: 20 } });
    return Promise.resolve({ data: {} });
  });
});

describe('AnimationStudioTab', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(screen.getByText('Frame Selection')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });
  });

  it('renders filter/collection mode toggle', async () => {
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(screen.getByText('By Filters')).toBeInTheDocument();
      expect(screen.getByText('From Collection')).toBeInTheDocument();
    });
  });

  it('shows empty animation history', async () => {
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(screen.getByText(/No animations yet/i)).toBeInTheDocument();
    });
  });

  // --- Defensive: API returns unexpected shapes ---

  it('handles collections API returning paginated object instead of array', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/collections') return Promise.resolve({ data: { items: [{ id: '1', name: 'Test Col', frame_count: 10 }], total: 1 } });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/crop-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/animations') return Promise.resolve({ data: { items: [], total: 0 } });
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AnimationStudioTab />);
    // Switch to collection mode
    await waitFor(() => {
      fireEvent.click(screen.getByText('From Collection'));
    });
    // The collection option should appear
    await waitFor(() => {
      expect(screen.getByText(/Test Col/)).toBeInTheDocument();
    });
  });

  it('handles crop-presets API returning paginated object', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/crop-presets') return Promise.resolve({ data: { items: [{ id: '1', name: 'Center Crop', x: 0, y: 0, width: 100, height: 100, created_at: '2024-01-01' }], total: 1 } });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      if (url === '/goes/animations') return Promise.resolve({ data: { items: [], total: 0 } });
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(screen.getByText(/Center Crop/)).toBeInTheDocument();
    });
  });

  it('handles products API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/products') return Promise.resolve({ data: null });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      if (url === '/goes/crop-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/animations') return Promise.resolve({ data: { items: [], total: 0 } });
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles animations API returning null items', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/animations') return Promise.resolve({ data: { items: null, total: 0 } });
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      if (url === '/goes/crop-presets') return Promise.resolve({ data: [] });
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(screen.getByText(/No animations yet/i)).toBeInTheDocument();
    });
  });

  // --- Animation history with data ---

  it('renders animation history items', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/animations') {
        return Promise.resolve({
          data: {
            items: [
              { id: '1', name: 'Test Anim', status: 'completed', frame_count: 24, fps: 10, format: 'mp4', quality: 'high', crop_preset_id: null, false_color: false, scale: '100%', output_path: '/tmp/anim.mp4', file_size: 5000, duration_seconds: 2.4, created_at: '2024-06-01', completed_at: '2024-06-01', error: '', job_id: null },
              { id: '2', name: 'Failed Anim', status: 'failed', frame_count: 0, fps: 10, format: 'gif', quality: 'low', crop_preset_id: null, false_color: false, scale: '50%', output_path: null, file_size: 0, duration_seconds: 0, created_at: '2024-06-01', completed_at: null, error: 'Out of memory', job_id: null },
              { id: '3', name: 'Pending Anim', status: 'pending', frame_count: 12, fps: 5, format: 'mp4', quality: 'medium', crop_preset_id: null, false_color: false, scale: '100%', output_path: null, file_size: 0, duration_seconds: 0, created_at: '2024-06-01', completed_at: null, error: '', job_id: null },
              { id: '4', name: 'Processing Anim', status: 'processing', frame_count: 12, fps: 5, format: 'mp4', quality: 'medium', crop_preset_id: null, false_color: false, scale: '100%', output_path: null, file_size: 0, duration_seconds: 0, created_at: '2024-06-01', completed_at: null, error: '', job_id: 'j1' },
            ],
            total: 4, page: 1, limit: 20,
          },
        });
      }
      if (url === '/goes/products') return Promise.resolve({ data: { satellites: [], bands: [], sectors: [] } });
      if (url === '/goes/collections') return Promise.resolve({ data: [] });
      if (url === '/goes/crop-presets') return Promise.resolve({ data: [] });
      if (url.includes('/goes/frames')) return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(screen.getByText('Test Anim')).toBeInTheDocument();
      expect(screen.getByText('Failed Anim')).toBeInTheDocument();
      expect(screen.getByText('Pending')).toBeInTheDocument();
      expect(screen.getByText('Processing')).toBeInTheDocument();
      expect(screen.getByText('Done')).toBeInTheDocument();
      expect(screen.getByText('Failed')).toBeInTheDocument();
    });
  });

  // --- Generate button disabled when no preview frames ---

  it('generate button is disabled when no preview frames', async () => {
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      const btn = screen.getByText('Generate Animation');
      expect(btn.closest('button')).toBeDisabled();
    });
  });

  // --- All APIs fail ---

  it('handles all APIs failing', async () => {
    mockedApi.get.mockRejectedValue(new Error('Network error'));
    const { container } = renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  // --- Format & quality toggles ---

  it('switches format between mp4 and gif', async () => {
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      const gifBtn = screen.getByText('GIF');
      fireEvent.click(gifBtn);
      expect(gifBtn.closest('button')).toBeTruthy();
      const mp4Btn = screen.getByText('MP4');
      fireEvent.click(mp4Btn);
      expect(mp4Btn.closest('button')).toBeTruthy();
    });
  });

  it('switches quality', async () => {
    renderWithProviders(<AnimationStudioTab />);
    await waitFor(() => {
      const lowBtn = screen.getByText('low');
      fireEvent.click(lowBtn);
      const highBtn = screen.getByText('high');
      fireEvent.click(highBtn);
      expect(highBtn).toBeTruthy();
    });
  });
});
