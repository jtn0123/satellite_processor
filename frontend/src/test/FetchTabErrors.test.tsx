import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FetchTab from '../components/GoesData/FetchTab';

const mockShowToast = vi.fn();

const mockPost = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/goes/products') {
        return Promise.resolve({
          data: {
            satellites: ['GOES-19'],
            sectors: [{ id: 'FullDisk', name: 'FullDisk', cadence_minutes: 10, typical_file_size_kb: 12000 }],
            bands: [{ id: 'C02', description: 'Red Visible', wavelength_um: 0.64, common_name: 'Red', category: 'visible', use_case: 'Primary visible' }],
            satellite_availability: {
              'GOES-19': { available_from: '2025-01-01', available_to: null, status: 'active', description: 'GOES-East' },
            },
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
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return function W({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

async function navigateToStep3AndFill() {
  // Wait for products to load (step 1)
  await waitFor(() => {
    expect(screen.getByText('Choose Satellite')).toBeInTheDocument();
  });

  // Navigate to step 2
  fireEvent.click(screen.getByText('Next'));
  await waitFor(() => expect(screen.getByText('What to Fetch')).toBeInTheDocument());

  // Navigate to step 3
  fireEvent.click(screen.getByText('Next'));
  await waitFor(() => expect(screen.getByLabelText(/start/i)).toBeInTheDocument());

  const startInput = screen.getByLabelText(/start/i);
  const endInput = screen.getByLabelText(/end/i);
  fireEvent.change(startInput, { target: { value: '2026-01-01T00:00' } });
  fireEvent.change(endInput, { target: { value: '2026-01-01T01:00' } });

  // Click Fetch to open confirmation
  await waitFor(() => {
    const btn = screen.getByRole('button', { name: /^fetch$/i });
    expect(btn).not.toBeDisabled();
  });
  fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));

  // Confirm in modal
  await waitFor(() => expect(screen.getByText('Confirm Fetch')).toBeInTheDocument());
  fireEvent.click(screen.getByText('Confirm'));
}

describe('FetchTab error handling', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    mockPost.mockClear();
  });

  it('shows default error message when detail is absent', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: {} } });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await navigateToStep3AndFill();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to create fetch job');
    });
  });

  it('shows validation error from array detail', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: [{ msg: 'Value error, Date range too large' }] } },
    });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await navigateToStep3AndFill();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Date range too large');
    });
  });

  it('shows string detail as error message', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: 'Custom server error' } },
    });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await navigateToStep3AndFill();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Custom server error');
    });
  });

  it('falls back to Validation error when array detail has no msg', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: [{}] } },
    });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await navigateToStep3AndFill();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Validation error');
    });
  });

  it('handles completely missing response object', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    render(<FetchTab />, { wrapper: makeWrapper() });
    await navigateToStep3AndFill();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to create fetch job');
    });
  });
});
