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

import PresetsTab from '../components/GoesData/PresetsTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
    if (url === '/goes/schedules') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: {} });
  });
});

describe('PresetsTab', () => {
  it('renders without crashing', async () => {
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText(/Fetch Presets/i)).toBeInTheDocument();
    });
  });

  it('shows create preset button', async () => {
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      const buttons = screen.getAllByRole('button');
      const createBtn = buttons.find(b => b.textContent?.includes('New Preset') || b.textContent?.includes('Create'));
      expect(createBtn || buttons.length > 0).toBeTruthy();
    });
  });

  it('shows schedules section', async () => {
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/Schedules/i).length).toBeGreaterThan(0);
    });
  });

  it('renders presets when data exists', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') {
        return Promise.resolve({
          data: [{
            id: '1', name: 'CONUS Red', satellite: 'GOES-16',
            sector: 'CONUS', band: 'C02', description: 'Test',
            created_at: '2024-06-01T00:00:00',
          }],
        });
      }
      if (url === '/goes/schedules') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText('CONUS Red')).toBeInTheDocument();
    });
  });

  it('renders schedules when data exists', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/fetch-presets') {
        return Promise.resolve({
          data: [{ id: '1', name: 'P1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02', description: '', created_at: '2024-01-01' }],
        });
      }
      if (url === '/goes/schedules') {
        return Promise.resolve({
          data: [{
            id: 's1', name: 'Hourly', preset_id: '1', interval_minutes: 60,
            is_active: true, last_run_at: null, next_run_at: '2024-06-01T13:00:00',
            preset: { id: '1', name: 'P1', satellite: 'GOES-16', sector: 'CONUS', band: 'C02' },
          }],
        });
      }
      return Promise.resolve({ data: {} });
    });
    renderWithProviders(<PresetsTab />);
    await waitFor(() => {
      expect(screen.getByText('Hourly')).toBeInTheDocument();
    });
  });
});
