import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OverviewTab from '../components/GoesData/OverviewTab';

// Mock api
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
      if (url === '/goes/frames/stats') {
        return Promise.resolve({
          data: {
            total_frames: 150,
            total_size_bytes: 5000000,
            by_satellite: {
              'GOES-19': { count: 100, size: 3000000 },
              'GOES-18': { count: 50, size: 2000000 },
            },
            by_band: {
              'C02': { count: 80, size: 2500000 },
              'C13': { count: 70, size: 2500000 },
            },
          },
        });
      }
      if (url === '/jobs') {
        return Promise.resolve({
          data: {
            items: [
              { id: '1', name: 'Fetch GOES-19 CONUS', status: 'completed', created_at: new Date().toISOString(), completed_at: new Date().toISOString() },
              { id: '2', name: 'Fetch GOES-18 FullDisk', status: 'running', created_at: new Date().toISOString(), completed_at: null },
            ],
            total: 2,
          },
        });
      }
      return Promise.resolve({ data: {} });
    }),
  },
}));

function renderWithQuery(ui: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

describe('OverviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the overview heading', () => {
    renderWithQuery(<OverviewTab />);
    expect(screen.getByText('Overview')).toBeInTheDocument();
  });

  it('renders quick action buttons', () => {
    renderWithQuery(<OverviewTab />);
    expect(screen.getByText('Fetch Last Hour CONUS')).toBeInTheDocument();
    expect(screen.getByText('Fetch Latest FullDisk')).toBeInTheDocument();
    expect(screen.getByText('True Color Now')).toBeInTheDocument();
    expect(screen.getByText('View Gallery')).toBeInTheDocument();
  });

  it('dispatches switch-tab event on quick action click', () => {
    renderWithQuery(<OverviewTab />);
    const handler = vi.fn();
    globalThis.addEventListener('switch-tab', handler);
    fireEvent.click(screen.getByText('View Gallery'));
    expect(handler).toHaveBeenCalled();
    globalThis.removeEventListener('switch-tab', handler);
  });

  it('renders stat cards', async () => {
    renderWithQuery(<OverviewTab />);
    // Stats load async, check static labels
    expect(screen.getByText('Total Frames')).toBeInTheDocument();
    expect(screen.getByText('Disk Usage')).toBeInTheDocument();
    expect(screen.getByText('Satellites')).toBeInTheDocument();
  });
});
