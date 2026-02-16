import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import PresetsTab from '../components/GoesData/PresetsTab';
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
    if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
    if (url === '/goes/schedules') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

describe('PresetsTab - Defensive Scenarios', () => {
  it('handles presets API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: null });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles schedules API returning null', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      if (url === '/goes/schedules') return Promise.resolve({ data: null });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles all APIs failing', async () => {
    mockedApi.get.mockRejectedValue(new Error('Network error'));
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles presets API returning paginated object', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({
        data: { items: [{ id: '1', name: 'Test Preset', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', description: '', created_at: '2024-01-01' }], total: 1 },
      });
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('handles schedule with null preset reference', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [{ id: '1', name: 'P1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', description: '', created_at: '2024-01-01' }] });
      if (url === '/goes/schedules') return Promise.resolve({
        data: [{ id: 's1', name: 'Hourly', preset_id: '1', interval_minutes: 60, is_active: true, last_run_at: null, next_run_at: null, preset: null }],
      });
      return Promise.resolve({ data: {} });
    });
    const { container } = renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(container.innerHTML.length).toBeGreaterThan(0);
    });
  });

  it('renders empty presets and schedules', async () => {
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Fetch Presets/i)).toBeInTheDocument();
      expect(screen.getAllByText(/Schedules/i).length).toBeGreaterThan(0);
    });
  });
});
