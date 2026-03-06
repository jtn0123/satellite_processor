import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: { job_id: 'job-1' } })),
  },
}));

import LiveTab from '../components/GoesData/LiveTab';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

const PRODUCTS = {
  satellites: ['GOES-16', 'GOES-18', 'GOES-19'],
  sectors: [
    { id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' },
    { id: 'FullDisk', name: 'Full Disk', product: 'ABI-L2-CMIPF' },
  ],
  bands: [
    { id: 'GEOCOLOR', description: 'GeoColor (True Color Day, IR Night)' },
    { id: 'C01', description: 'Blue (0.47µm)' },
  ],
  default_satellite: 'GOES-16',
};

function renderLiveTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <LiveTab />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  mockedApi.get.mockImplementation((url: string) => {
    if (url === '/satellite/products') return Promise.resolve({ data: PRODUCTS });
    if (url.startsWith('/satellite/latest')) {
      const axiosError = Object.assign(new Error('Not found'), {
        isAxiosError: true,
        response: { status: 404 },
      });
      return Promise.reject(axiosError);
    }
    if (url.startsWith('/satellite/catalog/latest')) return Promise.resolve({ data: null });
    return Promise.resolve({ data: {} });
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Himawari improved empty state', () => {
  it('shows improved empty state with title and subtitle', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Switch to Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() => expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    await waitFor(() => {
      expect(screen.getByTestId('himawari-no-preview')).toBeInTheDocument();
    });

    // Check new title and subtitle text
    expect(screen.getByText('No Himawari-9 data yet')).toBeInTheDocument();
    expect(screen.getByText(/Fetch data to get started/)).toBeInTheDocument();
  });

  it('"Go to Fetch" button navigates to /goes?tab=fetch', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    // Switch to Himawari-9
    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() => expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    await waitFor(() => {
      expect(screen.getByTestId('himawari-go-to-fetch')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('himawari-go-to-fetch'));
    expect(mockNavigate).toHaveBeenCalledWith('/goes?tab=fetch');
  });

  it('preserves data-testid for backward compatibility', async () => {
    renderLiveTab();
    await waitFor(() => expect(screen.getByTestId('pill-strip-satellite')).toBeInTheDocument());

    fireEvent.click(screen.getByTestId('pill-strip-satellite'));
    await waitFor(() => expect(screen.getByTestId('satellite-option-Himawari-9')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('satellite-option-Himawari-9'));

    await waitFor(() => {
      expect(screen.getByTestId('himawari-no-preview')).toBeInTheDocument();
    });
  });
});
