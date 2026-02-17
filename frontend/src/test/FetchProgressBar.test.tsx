import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FetchProgressBar from '../components/GoesData/FetchProgressBar';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/jobs') {
        return Promise.resolve({
          data: {
            items: [
              { id: 'job-1', name: 'GOES-19 CONUS C02', status: 'processing', progress: 45, status_message: 'Fetching...', created_at: '2025-01-01T00:00:00Z' },
              { id: 'job-2', name: 'GOES-18 FullDisk C13', status: 'pending', progress: 0, status_message: '', created_at: '2025-01-01T00:01:00Z' },
            ],
            total: 2,
          },
        });
      }
      return Promise.resolve({ data: {} });
    }),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('FetchProgressBar', () => {
  it('shows active job progress', async () => {
    renderWithQuery(<FetchProgressBar />);
    await waitFor(() => expect(screen.getByText('GOES-19 CONUS C02')).toBeInTheDocument());
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('shows queued count', async () => {
    renderWithQuery(<FetchProgressBar />);
    await waitFor(() => expect(screen.getByText('+1 queued')).toBeInTheDocument());
  });

  it('expands to show all jobs', async () => {
    renderWithQuery(<FetchProgressBar />);
    await waitFor(() => expect(screen.getByText('GOES-19 CONUS C02')).toBeInTheDocument());
    // Click to expand
    fireEvent.click(screen.getByText('GOES-19 CONUS C02').closest('[class*="cursor-pointer"]')!);
    await waitFor(() => expect(screen.getByText('GOES-18 FullDisk C13')).toBeInTheDocument());
  });
});
