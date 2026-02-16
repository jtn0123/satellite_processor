import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: [] })),
    patch: vi.fn(() => Promise.resolve({})),
  },
}));

import NotificationBell from '../components/NotificationBell';
import api from '../api/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockedApi = api as any;

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('NotificationBell - Defensive Scenarios', () => {
  it('handles API returning null', async () => {
    mockedApi.get.mockResolvedValue({ data: null });
    renderWithQuery(<NotificationBell />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('handles API returning undefined', async () => {
    mockedApi.get.mockResolvedValue({ data: undefined });
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('handles API returning paginated object instead of array', async () => {
    mockedApi.get.mockResolvedValue({
      data: { items: [{ id: 'n1', message: 'Test notification', type: 'fetch_complete', read: false, created_at: '2026-01-01T12:00:00Z' }], total: 1 },
    });
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Test notification')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully (catches error)', async () => {
    mockedApi.get.mockRejectedValue(new Error('Network error'));
    renderWithQuery(<NotificationBell />);
    // Should still render the bell button without crashing
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles empty notification list', async () => {
    mockedApi.get.mockResolvedValue({ data: [] });
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('shows unread count badge', async () => {
    mockedApi.get.mockResolvedValue({
      data: [
        { id: 'n1', message: 'Unread 1', type: 'fetch_complete', read: false, created_at: '2026-01-01T12:00:00Z' },
        { id: 'n2', message: 'Unread 2', type: 'fetch_complete', read: false, created_at: '2026-01-01T11:00:00Z' },
        { id: 'n3', message: 'Read', type: 'fetch_complete', read: true, created_at: '2026-01-01T10:00:00Z' },
      ],
    });
    renderWithQuery(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows 9+ when more than 9 unread', async () => {
    const notifications = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`, message: `Notification ${i}`, type: 'fetch_complete', read: false, created_at: '2026-01-01T12:00:00Z',
    }));
    mockedApi.get.mockResolvedValue({ data: notifications });
    renderWithQuery(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

  it('shows no badge when all are read', async () => {
    mockedApi.get.mockResolvedValue({
      data: [{ id: 'n1', message: 'Read', type: 'fetch_complete', read: true, created_at: '2026-01-01T12:00:00Z' }],
    });
    renderWithQuery(<NotificationBell />);
    await waitFor(() => {
      // No badge text should be present for counts
      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  it('only shows first 10 notifications in dropdown', async () => {
    const notifications = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`, message: `Notification ${i}`, type: 'fetch_complete', read: false, created_at: '2026-01-01T12:00:00Z',
    }));
    mockedApi.get.mockResolvedValue({ data: notifications });
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      // Should show first 10 but not the 11th
      expect(screen.getByText('Notification 0')).toBeInTheDocument();
      expect(screen.getByText('Notification 9')).toBeInTheDocument();
      expect(screen.queryByText('Notification 10')).not.toBeInTheDocument();
    });
  });
});
