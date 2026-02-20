import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from '../components/Layout';

// Mock heavy child components to keep tests fast
vi.mock('../components/ConnectionStatus', () => ({ default: () => <div data-testid="connection-status" /> }));
vi.mock('../components/NotificationBell', () => ({ default: () => <div data-testid="notification-bell" /> }));
vi.mock('../components/KeyboardShortcuts', () => ({ default: () => null }));
vi.mock('../components/WhatsNewModal', () => ({ default: () => null }));
vi.mock('../components/MobileBottomNav', () => ({ default: () => <nav data-testid="mobile-nav" /> }));
vi.mock('../hooks/useJobToasts', () => ({ useJobToasts: () => {} }));

function renderLayout(route = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="*" element={<div>Page content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Layout / Navigation Sidebar', () => {
  it('renders sidebar nav links', () => {
    renderLayout();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Browse & Fetch').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Jobs').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Settings').length).toBeGreaterThanOrEqual(1);
  });

  it('renders the Outlet content', () => {
    renderLayout();
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });

  it('renders theme toggle button', () => {
    renderLayout();
    const themeBtns = screen.getAllByLabelText(/switch to (light|dark) theme/i);
    expect(themeBtns.length).toBeGreaterThanOrEqual(1);
  });

  it('renders mobile bottom nav', () => {
    renderLayout();
    expect(screen.getByTestId('mobile-nav')).toBeInTheDocument();
  });
});
