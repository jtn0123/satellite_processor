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

describe('FetchTab', () => {
  it('renders the Fetch Latest button', async () => {
    render(<FetchTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Fetch Latest')).toBeInTheDocument());
  });

  it('renders satellite cards on initial step', async () => {
    render(<FetchTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('GOES-19')).toBeInTheDocument());
    expect(screen.getByText('Choose Satellite')).toBeInTheDocument();
  });

  it('navigates to step 3 and shows time inputs', async () => {
    render(<FetchTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('What to Fetch')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByLabelText(/start/i)).toBeInTheDocument());
  });

  it('disables Fetch button when no times set', async () => {
    render(<FetchTab />, { wrapper });
    await waitFor(() => expect(screen.getByText('Choose Satellite')).toBeInTheDocument());
    // Navigate to step 3
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByText('What to Fetch')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => expect(screen.getByLabelText(/start/i)).toBeInTheDocument());
    // Fetch button should be disabled without times
    const fetchBtn = screen.getByRole('button', { name: /^fetch$/i });
    expect(fetchBtn).toBeDisabled();
  });
});
