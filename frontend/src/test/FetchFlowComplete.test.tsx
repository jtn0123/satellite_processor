import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FetchTab from '../components/GoesData/FetchTab';

const mockShowToast = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/goes/products') {
        return Promise.resolve({
          data: {
            satellites: ['GOES-16', 'GOES-19'],
            satellite_availability: {
              'GOES-16': { available_from: '2017-12-01', available_to: '2025-03-01', status: 'standby', description: 'Standby' },
              'GOES-19': { available_from: '2025-01-01', available_to: null, status: 'active', description: 'GOES-East' },
            },
            sectors: [
              { id: 'CONUS', name: 'CONUS', product: 'ABI', cadence_minutes: 5, typical_file_size_kb: 4000 },
              { id: 'FullDisk', name: 'Full Disk', product: 'ABI', cadence_minutes: 10, typical_file_size_kb: 12000 },
            ],
            bands: [
              { id: 'C02', description: 'Red Visible', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Primary' },
              { id: 'C13', description: 'Clean IR', wavelength_um: 10.3, common_name: 'IR', category: 'infrared', use_case: 'Clouds' },
            ],
            default_satellite: 'GOES-19',
          },
        });
      }
      if (url === '/goes/catalog') return Promise.resolve({ data: [] });
      if (url === '/jobs') return Promise.resolve({ data: { items: [], total: 0 } });
      return Promise.resolve({ data: {} });
    }),
    post: vi.fn().mockResolvedValue({ data: { job_id: 'test-job-123' } }),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import api from '../api/client';
const mockedApi = api as unknown as { get: ReturnType<typeof vi.fn>; post: ReturnType<typeof vi.fn> };

function renderFetch() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={qc}><FetchTab /></QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

async function expandAdvanced() {
  const toggle = await screen.findByTestId('advanced-fetch-toggle');
  fireEvent.click(toggle);
}

describe('FetchFlowComplete', () => {
  it('step 0: satellite selection renders all options', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => {
      expect(screen.getByText('Choose Satellite')).toBeInTheDocument();
      expect(screen.getByText('GOES-16')).toBeInTheDocument();
      expect(screen.getByText('GOES-19')).toBeInTheDocument();
    });
  });

  it('step 0: shows active/historical status badges', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => {
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Historical')).toBeInTheDocument();
    });
  });

  it('step 1: sector selection shows available sectors', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => {
      expect(screen.getByText('What to Fetch')).toBeInTheDocument();
      expect(screen.getByText('Sector')).toBeInTheDocument();
    });
  });

  it('step 1: image type toggle works', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Image Type'));
    fireEvent.click(screen.getByText('True Color'));
    expect(screen.getByText(/Fetches bands C01/)).toBeInTheDocument();
  });

  it('step 2: time range selection renders inputs', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => {
      expect(screen.getByLabelText(/start/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/end/i)).toBeInTheDocument();
    });
  });

  it('validation: fetch button disabled without times', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => {
      const fetchBtn = screen.getByText('Fetch');
      expect(fetchBtn.closest('button')).toBeDisabled();
    });
  });

  it('quick hours buttons set correct time range', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Last Hour'));
    fireEvent.click(screen.getByText('Last Hour'));
    const startInput = screen.getByLabelText(/start/i) as HTMLInputElement;
    const endInput = screen.getByLabelText(/end/i) as HTMLInputElement;
    expect(startInput.value).toBeTruthy();
    expect(endInput.value).toBeTruthy();
  });

  it('quick 6h button sets correct range', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Last 6h'));
    fireEvent.click(screen.getByText('Last 6h'));
    const startInput = screen.getByLabelText(/start/i) as HTMLInputElement;
    expect(startInput.value).toBeTruthy();
  });

  it('estimate display shows frame count and size', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Last Hour'));
    fireEvent.click(screen.getByText('Last Hour'));
    await waitFor(() => {
      expect(screen.getByText(/frames/)).toBeInTheDocument();
      expect(screen.getByText(/MB/)).toBeInTheDocument();
    });
  });

  it('confirm dialog appears on submit', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Last Hour'));
    fireEvent.click(screen.getByText('Last Hour'));
    await waitFor(() => {
      const fetchBtn = screen.getByText('Fetch');
      expect(fetchBtn.closest('button')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByText('Fetch'));
    await waitFor(() => {
      expect(screen.getByText('Confirm Fetch')).toBeInTheDocument();
      expect(screen.getByText('Confirm')).toBeInTheDocument();
    });
  });

  it('confirm dialog submit calls API and shows toast', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Last Hour'));
    fireEvent.click(screen.getByText('Last Hour'));
    await waitFor(() => expect(screen.getByText('Fetch').closest('button')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Fetch'));
    await waitFor(() => screen.getByText('Confirm'));
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockedApi.post).toHaveBeenCalled();
      expect(mockShowToast).toHaveBeenCalledWith('success', expect.stringContaining('test-job-123'));
    });
  });

  it('error handling when fetch API fails', async () => {
    mockedApi.post.mockRejectedValueOnce({ response: { data: { detail: 'Rate limited' } } });
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('Last Hour'));
    fireEvent.click(screen.getByText('Last Hour'));
    await waitFor(() => expect(screen.getByText('Fetch').closest('button')).not.toBeDisabled());
    fireEvent.click(screen.getByText('Fetch'));
    await waitFor(() => screen.getByText('Confirm'));
    fireEvent.click(screen.getByText('Confirm'));
    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Rate limited');
    });
  });

  it('step navigation via step indicators', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('When'));
    await waitFor(() => {
      expect(screen.getByLabelText(/start/i)).toBeInTheDocument();
    });
  });

  it('back button navigates to previous step', async () => {
    renderFetch();
    await expandAdvanced();
    await waitFor(() => screen.getByText('Choose Satellite'));
    fireEvent.click(screen.getByText('Next'));
    await waitFor(() => screen.getByText('What to Fetch'));
    fireEvent.click(screen.getByText('Back'));
    await waitFor(() => {
      expect(screen.getByText('Choose Satellite')).toBeInTheDocument();
    });
  });
});
