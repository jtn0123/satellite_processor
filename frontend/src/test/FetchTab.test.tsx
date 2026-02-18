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
            satellites: ['GOES-19'],
            satellite_availability: {
              'GOES-19': { available_from: '2025-01-01', available_to: null, status: 'active', description: 'GOES-East' },
            },
            sectors: [{ id: 'FullDisk', name: 'FullDisk', cadence_minutes: 10, typical_file_size_kb: 12000 }],
            bands: [{ id: 'C02', description: 'Red Visible', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Primary' }],
            default_satellite: 'GOES-19',
          },
        });
      }
      if (url === '/goes/catalog') return Promise.resolve({ data: [] });
      if (url === '/jobs') return Promise.resolve({ data: { items: [], total: 0 } });
      if (url === '/goes/fetch-presets') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: { job_id: 'test-job' } }),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function expandAdvanced() {
  const toggle = await screen.findByTestId('advanced-fetch-toggle');
  fireEvent.click(toggle);
}

describe('FetchTab', () => {
  it('renders quick fetch chips by default', async () => {
    render(<FetchTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Quick Fetch')).toBeInTheDocument());
    expect(screen.getByText('CONUS Last Hour')).toBeInTheDocument();
  });

  it('renders satellite cards after expanding advanced', async () => {
    render(<FetchTab />, { wrapper });
    await expandAdvanced();
    await waitFor(() => expect(screen.getByText('GOES-19')).toBeInTheDocument());
    expect(screen.getByText('Choose Satellite')).toBeInTheDocument();
  });

  it('navigates to When step (step 2) and shows time inputs', async () => {
    render(<FetchTab />, { wrapper });
    await expandAdvanced();
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('What to Fetch')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByLabelText(/start/i)).toBeInTheDocument());
  });

  it('disables Fetch button when no times set', async () => {
    render(<FetchTab />, { wrapper });
    await expandAdvanced();
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('What to Fetch')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByLabelText(/start/i)).toBeInTheDocument());
    const fetchBtn = screen.getByRole('button', { name: /^fetch$/i });
    expect(fetchBtn).toBeDisabled();
  });
});
