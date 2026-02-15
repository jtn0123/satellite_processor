import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import NotificationBell from '../components/NotificationBell';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({
      data: [
        { id: 'n1', message: 'Fetch complete', type: 'fetch_complete', read: false, created_at: '2026-01-01T12:00:00Z' },
        { id: 'n2', message: 'Old note', type: 'fetch_complete', read: true, created_at: '2026-01-01T11:00:00Z' },
      ],
    })),
    patch: vi.fn(() => Promise.resolve({})),
  },
}));

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('NotificationBell', () => {
  it('renders bell button', () => {
    renderWithQuery(<NotificationBell />);
    expect(screen.getByRole('button')).toBeInTheDocument();
  });

  it('opens dropdown on click', () => {
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Notifications')).toBeInTheDocument();
  });

  it('closes dropdown on second click', () => {
    renderWithQuery(<NotificationBell />);
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('closes dropdown on outside click', () => {
    renderWithQuery(<NotificationBell />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Notifications')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
  });

  it('has accessible label', () => {
    renderWithQuery(<NotificationBell />);
    expect(screen.getByLabelText(/Notifications/)).toBeInTheDocument();
  });
});
