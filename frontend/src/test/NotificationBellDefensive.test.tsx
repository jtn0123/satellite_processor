import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';

// Stub the websocket-backed ConnectionStatus hook so happy-dom doesn't
// try to open a real /ws/status connection alongside the MSW interceptor.
vi.mock('../components/ConnectionStatus', () => ({
  useIsWebSocketConnected: () => false,
}));

import NotificationBell from '../components/NotificationBell';
import { setupMswServer } from './mocks/msw';

const server = setupMswServer();

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('NotificationBell - Defensive Scenarios', () => {
  it('handles API returning null', async () => {
    server.use(http.get('*/api/notifications', () => HttpResponse.json(null)));
    renderWithQuery(<NotificationBell />);
    expect(screen.getByRole('button')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('handles API returning undefined', async () => {
    server.use(http.get('*/api/notifications', () => new HttpResponse('', { status: 200 })));
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('handles API returning paginated object instead of array', async () => {
    server.use(
      http.get('*/api/notifications', () =>
        HttpResponse.json({
          items: [
            {
              id: 'n1',
              message: 'Test notification',
              type: 'fetch_complete',
              read: false,
              created_at: '2026-01-01T12:00:00Z',
            },
          ],
          total: 1,
        }),
      ),
    );
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('Test notification')).toBeInTheDocument();
    });
  });

  it('handles API error gracefully (catches error)', async () => {
    server.use(http.get('*/api/notifications', () => HttpResponse.error()));
    renderWithQuery(<NotificationBell />);
    // Should still render the bell button without crashing
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('handles empty notification list', async () => {
    // Default handler already returns [] — no override needed.
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => {
      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });
  });

  it('shows unread count badge', async () => {
    server.use(
      http.get('*/api/notifications', () =>
        HttpResponse.json([
          {
            id: 'n1',
            message: 'Unread 1',
            type: 'fetch_complete',
            read: false,
            created_at: '2026-01-01T12:00:00Z',
          },
          {
            id: 'n2',
            message: 'Unread 2',
            type: 'fetch_complete',
            read: false,
            created_at: '2026-01-01T11:00:00Z',
          },
          {
            id: 'n3',
            message: 'Read',
            type: 'fetch_complete',
            read: true,
            created_at: '2026-01-01T10:00:00Z',
          },
        ]),
      ),
    );
    renderWithQuery(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows 9+ when more than 9 unread', async () => {
    const notifications = Array.from({ length: 12 }, (_, i) => ({
      id: `n${i}`,
      message: `Notification ${i}`,
      type: 'fetch_complete',
      read: false,
      created_at: '2026-01-01T12:00:00Z',
    }));
    server.use(http.get('*/api/notifications', () => HttpResponse.json(notifications)));
    renderWithQuery(<NotificationBell />);
    await waitFor(() => {
      expect(screen.getByText('9+')).toBeInTheDocument();
    });
  });

  it('shows no badge when all are read', async () => {
    server.use(
      http.get('*/api/notifications', () =>
        HttpResponse.json([
          {
            id: 'n1',
            message: 'Read',
            type: 'fetch_complete',
            read: true,
            created_at: '2026-01-01T12:00:00Z',
          },
        ]),
      ),
    );
    renderWithQuery(<NotificationBell />);
    await waitFor(() => {
      // No badge text should be present for counts
      expect(screen.queryByText('1')).not.toBeInTheDocument();
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  it('only shows first 10 notifications in dropdown', async () => {
    const notifications = Array.from({ length: 15 }, (_, i) => ({
      id: `n${i}`,
      message: `Notification ${i}`,
      type: 'fetch_complete',
      read: false,
      created_at: '2026-01-01T12:00:00Z',
    }));
    server.use(http.get('*/api/notifications', () => HttpResponse.json(notifications)));
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
