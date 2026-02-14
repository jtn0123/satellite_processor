import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FetchTab from '../components/GoesData/FetchTab';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/goes/products') {
        return Promise.resolve({
          data: {
            satellites: ['GOES-19'],
            sectors: ['FullDisk'],
            bands: ['C02'],
            satellite_availability: {
              'GOES-19': { available_from: '2025-01-01', available_to: null },
            },
          },
        });
      }
      if (url === '/goes/frame-count') {
        return Promise.resolve({ data: { count: 500 } });
      }
      if (url === '/settings') {
        return Promise.resolve({ data: { max_frames_per_fetch: 200 } });
      }
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
  it('renders the Fetch button', () => {
    render(<FetchTab />, { wrapper });
    expect(screen.getByText('Fetch')).toBeInTheDocument();
  });

  it('renders start/end time inputs', () => {
    render(<FetchTab />, { wrapper });
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
  });

  it('disables Fetch when no times are set', () => {
    render(<FetchTab />, { wrapper });
    const btn = screen.getByText('Fetch').closest('button');
    expect(btn).toBeDisabled();
  });
});
