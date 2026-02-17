import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import GapsTab from '../components/GoesData/GapsTab';
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
    if (url === '/goes/products') {
      return Promise.resolve({
        data: {
          satellites: ['GOES-16', 'GOES-19'],
          bands: [{ id: 'C02', description: 'Red' }, { id: 'C13', description: 'IR' }],
        },
      });
    }
    return Promise.resolve({ data: {} });
  });
});

describe('GapsTab', () => {
  it('renders header and controls', () => {
    renderWithProviders(<GapsTab />);
    expect(screen.getByText('Gap Detection')).toBeInTheDocument();
    expect(screen.getByText('Detect Gaps')).toBeInTheDocument();
  });

  it('shows empty state before scanning', () => {
    renderWithProviders(<GapsTab />);
    expect(screen.getByText(/Select parameters and click/)).toBeInTheDocument();
  });

  it('shows coverage percentage after scan', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/gaps') {
        return Promise.resolve({
          data: {
            coverage_percent: 87.5,
            gap_count: 2,
            total_frames: 144,
            expected_frames: 160,
            time_range: { start: '2024-06-01T00:00:00Z', end: '2024-06-01T23:59:59Z' },
            gaps: [
              { start: '2024-06-01T06:00:00Z', end: '2024-06-01T07:00:00Z', duration_minutes: 60, expected_frames: 6 },
              { start: '2024-06-01T14:00:00Z', end: '2024-06-01T14:30:00Z', duration_minutes: 30, expected_frames: 3 },
            ],
          },
        });
      }
      if (url === '/goes/products') {
        return Promise.resolve({ data: { satellites: ['GOES-19'], bands: [{ id: 'C02', description: 'Red' }] } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<GapsTab />);
    fireEvent.click(screen.getByText('Detect Gaps'));

    await waitFor(() => {
      expect(screen.getByText('87.5%')).toBeInTheDocument();
    });
    expect(screen.getByText('2')).toBeInTheDocument(); // gap_count
    expect(screen.getByText('144')).toBeInTheDocument(); // total_frames
  });

  it('renders gap list items', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/gaps') {
        return Promise.resolve({
          data: {
            coverage_percent: 90,
            gap_count: 1,
            total_frames: 100,
            expected_frames: 110,
            time_range: null,
            gaps: [
              { start: '2024-06-01T06:00:00Z', end: '2024-06-01T07:00:00Z', duration_minutes: 60, expected_frames: 6 },
            ],
          },
        });
      }
      if (url === '/goes/products') {
        return Promise.resolve({ data: { satellites: ['GOES-19'], bands: [{ id: 'C02', description: 'Red' }] } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<GapsTab />);
    fireEvent.click(screen.getByText('Detect Gaps'));

    await waitFor(() => {
      expect(screen.getByText('Detected Gaps')).toBeInTheDocument();
    });
    expect(screen.getByText(/60 min/)).toBeInTheDocument();
    expect(screen.getByText(/~6 frames missing/)).toBeInTheDocument();
  });

  it('shows no-gaps message when coverage is 100%', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/gaps') {
        return Promise.resolve({
          data: {
            coverage_percent: 100,
            gap_count: 0,
            total_frames: 144,
            expected_frames: 144,
            time_range: null,
            gaps: [],
          },
        });
      }
      if (url === '/goes/products') {
        return Promise.resolve({ data: { satellites: ['GOES-19'], bands: [{ id: 'C02', description: 'Red' }] } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<GapsTab />);
    fireEvent.click(screen.getByText('Detect Gaps'));

    await waitFor(() => {
      expect(screen.getByText(/No gaps detected/)).toBeInTheDocument();
    });
  });

  it('backfill button shows confirmation dialog', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/gaps') {
        return Promise.resolve({
          data: {
            coverage_percent: 90,
            gap_count: 1,
            total_frames: 100,
            expected_frames: 110,
            time_range: null,
            gaps: [
              { start: '2024-06-01T06:00:00Z', end: '2024-06-01T07:00:00Z', duration_minutes: 60, expected_frames: 6 },
            ],
          },
        });
      }
      if (url === '/goes/products') {
        return Promise.resolve({ data: { satellites: ['GOES-19'], bands: [{ id: 'C02', description: 'Red' }] } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<GapsTab />);
    fireEvent.click(screen.getByText('Detect Gaps'));

    await waitFor(() => {
      expect(screen.getByText('Backfill All (1)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Backfill All (1)'));
    await waitFor(() => {
      expect(screen.getByText('Confirm Backfill')).toBeInTheDocument();
    });
  });

  it('confirm backfill calls API', async () => {
    mockedApi.get.mockImplementation((url: string) => {
      if (url === '/goes/gaps') {
        return Promise.resolve({
          data: {
            coverage_percent: 90, gap_count: 1, total_frames: 100, expected_frames: 110, time_range: null,
            gaps: [{ start: '2024-06-01T06:00:00Z', end: '2024-06-01T07:00:00Z', duration_minutes: 60, expected_frames: 6 }],
          },
        });
      }
      if (url === '/goes/products') {
        return Promise.resolve({ data: { satellites: ['GOES-19'], bands: [{ id: 'C02', description: 'Red' }] } });
      }
      return Promise.resolve({ data: {} });
    });

    renderWithProviders(<GapsTab />);
    fireEvent.click(screen.getByText('Detect Gaps'));

    await waitFor(() => screen.getByText('Backfill All (1)'));
    fireEvent.click(screen.getByText('Backfill All (1)'));

    await waitFor(() => screen.getByText('Confirm Backfill'));
    fireEvent.click(screen.getByText('Confirm Backfill'));

    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalledWith('/goes/backfill', expect.objectContaining({
        satellite: 'GOES-19',
        band: 'C02',
        sector: 'FullDisk',
      }));
    });
  });
});
