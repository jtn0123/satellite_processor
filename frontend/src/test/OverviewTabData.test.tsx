/**
 * OverviewTab tests with loaded data — covers dashboard rendering paths.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OverviewTab from '../components/GoesData/OverviewTab';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/goes/catalog/latest') {
        return Promise.resolve({
          data: {
            scan_time: new Date().toISOString(),
            size: 12345,
            key: 'test.nc',
            satellite: 'GOES-19',
            sector: 'CONUS',
            band: 'C02',
          },
        });
      }
      if (url === '/goes/dashboard-stats') {
        return Promise.resolve({
          data: {
            total_frames: 150,
            frames_by_satellite: {
              'GOES-19': 100,
              'GOES-18': 50,
            },
            last_fetch_time: new Date(Date.now() - 300000).toISOString(),
            active_schedules: 2,
            storage_by_satellite: {
              'GOES-19': 3000000,
              'GOES-18': 2000000,
            },
            storage_by_band: {
              'C02': 2500000,
              'C13': 2500000,
            },
            recent_jobs: [
              { id: '1', status: 'completed', created_at: new Date().toISOString(), status_message: 'Done' },
              { id: '2', status: 'failed', created_at: new Date().toISOString(), status_message: 'Error' },
              { id: '3', status: 'running', created_at: null, status_message: 'In progress' },
            ],
          },
        });
      }
      return Promise.resolve({ data: {} });
    }),
  },
}));

function renderWithQuery(ui: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('OverviewTab with data', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders dashboard stats when data loads', async () => {
    renderWithQuery(<OverviewTab />);
    await waitFor(() => {
      expect(screen.getByText('150')).toBeInTheDocument();
    });
    // Storage should show
    expect(screen.getByText(/4\.\d+ MB/i)).toBeInTheDocument();
    // Satellite count
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders satellite breakdown bars', async () => {
    renderWithQuery(<OverviewTab />);
    await waitFor(() => {
      expect(screen.getAllByText('GOES-19').length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.getAllByText('GOES-18').length).toBeGreaterThanOrEqual(1);
  });

  it('renders band storage breakdown', async () => {
    renderWithQuery(<OverviewTab />);
    await waitFor(() => {
      expect(screen.getByText('C02')).toBeInTheDocument();
    });
    expect(screen.getByText('C13')).toBeInTheDocument();
  });

  it('renders recent jobs with status icons', async () => {
    renderWithQuery(<OverviewTab />);
    await waitFor(() => {
      expect(screen.getByText('Done')).toBeInTheDocument();
    });
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('In progress')).toBeInTheDocument();
  });

  it('renders catalog latest section', async () => {
    renderWithQuery(<OverviewTab />);
    await waitFor(() => {
      expect(screen.getAllByText(/CONUS/).length).toBeGreaterThanOrEqual(2);
    });
  });

  it('dispatches fetch-prefill on quick action', async () => {
    renderWithQuery(<OverviewTab />);
    const handler = vi.fn();
    globalThis.addEventListener('fetch-prefill', handler);
    fireEvent.click(screen.getByText('Fetch Last Hour CONUS'));
    expect(handler).toHaveBeenCalled();
    globalThis.removeEventListener('fetch-prefill', handler);
  });

  it('dispatches switch-tab for FullDisk action', () => {
    renderWithQuery(<OverviewTab />);
    const handler = vi.fn();
    globalThis.addEventListener('switch-tab', handler);
    fireEvent.click(screen.getByText('Fetch Latest FullDisk'));
    expect(handler).toHaveBeenCalledTimes(1);
    globalThis.removeEventListener('switch-tab', handler);
  });
});
