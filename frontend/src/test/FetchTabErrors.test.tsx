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
            sectors: [{ id: 'FullDisk', name: 'Full Disk' }],
            bands: [{ id: 'C02', description: 'Red Visible' }],
            satellite_availability: {
              'GOES-19': { available_from: '2025-01-01', available_to: null, status: 'active' },
            },
          },
        });
      }
      if (url === '/goes/frame-count') {
        return Promise.resolve({ data: { count: 10 } });
      }
      if (url === '/settings') {
        return Promise.resolve({ data: { max_frames_per_fetch: 200 } });
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

async function fillAndSubmit() {
  // Wait for products to load
  await waitFor(() => {
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument();
  });

  const startInput = screen.getByLabelText(/start time/i);
  const endInput = screen.getByLabelText(/end time/i);
  fireEvent.change(startInput, { target: { value: '2026-01-01T00:00' } });
  fireEvent.change(endInput, { target: { value: '2026-01-01T01:00' } });

  await waitFor(() => {
    const btn = screen.getByText('Fetch').closest('button');
    expect(btn).not.toBeDisabled();
  });

  fireEvent.click(screen.getByText('Fetch').closest('button')!);
}

describe('FetchTab error handling', () => {
  beforeEach(() => {
    mockShowToast.mockClear();
    mockPost.mockClear();
  });

  it('shows default error message when detail is absent', async () => {
    mockPost.mockRejectedValueOnce({ response: { data: {} } });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to create fetch job');
    });
  });

  it('shows validation error from array detail', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: [{ msg: 'Value error, Date range too large' }] } },
    });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Date range too large');
    });
  });

  it('shows string detail as error message', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: 'Custom server error' } },
    });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Custom server error');
    });
  });

  it('falls back to Validation error when array detail has no msg', async () => {
    mockPost.mockRejectedValueOnce({
      response: { data: { detail: [{}] } },
    });
    render(<FetchTab />, { wrapper: makeWrapper() });
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Validation error');
    });
  });

  it('handles completely missing response object', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    render(<FetchTab />, { wrapper: makeWrapper() });
    await fillAndSubmit();

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to create fetch job');
    });
  });
});
