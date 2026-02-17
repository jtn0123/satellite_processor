import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FetchTab from '../components/GoesData/FetchTab';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/goes/products') {
        return Promise.resolve({
          data: {
            satellites: ['GOES-19', 'GOES-18', 'GOES-16'],
            satellite_availability: {
              'GOES-19': { available_from: '2024-01-01', available_to: null, status: 'active', description: 'GOES-East (active)' },
              'GOES-18': { available_from: '2022-01-01', available_to: null, status: 'active', description: 'GOES-West (active)' },
              'GOES-16': { available_from: '2017-01-01', available_to: '2025-04-07', status: 'historical', description: 'GOES-East (historical)' },
            },
            sectors: [
              { id: 'FullDisk', name: 'FullDisk', product: 'ABI-L2-CMIPF', cadence_minutes: 10, typical_file_size_kb: 12000 },
              { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPC', cadence_minutes: 5, typical_file_size_kb: 4000 },
            ],
            bands: [
              { id: 'C02', description: 'Red (0.64µm)', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Primary visible' },
            ],
            default_satellite: 'GOES-19',
          },
        });
      }
      if (url === '/goes/catalog') {
        return Promise.resolve({ data: [] });
      }
      if (url === '/jobs') {
        return Promise.resolve({ data: { items: [], total: 0 } });
      }
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: { job_id: 'test-job-1', status: 'pending', message: 'ok' } }),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FetchTab Wizard', () => {
  it('renders step indicators', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('Source')).toBeInTheDocument());
    expect(screen.getByText('What')).toBeInTheDocument();
    expect(screen.getByText('When')).toBeInTheDocument();
  });

  it('shows Fetch Latest button', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('Fetch Latest')).toBeInTheDocument());
  });

  it('shows satellite cards on step 1', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('GOES-19')).toBeInTheDocument());
    expect(screen.getByText('GOES-18')).toBeInTheDocument();
    expect(screen.getByText('GOES-16')).toBeInTheDocument();
  });

  it('shows active/historical badges', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('GOES-19')).toBeInTheDocument());
    const badges = screen.getAllByText('Active');
    expect(badges.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Historical')).toBeInTheDocument();
  });

  it('navigates to step 2 on Next', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('What to Fetch')).toBeInTheDocument());
  });

  it('shows image type toggle on step 2', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('Single Band')).toBeInTheDocument());
    expect(screen.getByText('True Color')).toBeInTheDocument();
    expect(screen.getByText('Natural Color')).toBeInTheDocument();
  });

  it('hides band picker when True Color selected', async () => {
    renderWithQuery(<FetchTab />);
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('True Color')).toBeInTheDocument());
    fireEvent.click(screen.getByText('True Color'));
    // Band heading should not be visible
    expect(screen.queryByText('Band')).not.toBeInTheDocument();
  });
});
