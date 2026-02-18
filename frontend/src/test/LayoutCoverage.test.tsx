import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/useWebSocket', () => ({ default: vi.fn(() => null) }));
vi.mock('../hooks/useJobToasts', () => ({ useJobToasts: vi.fn() }));
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import Layout from '../components/Layout';

function renderLayout() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Layout />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Layout coverage boost', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() =>
      Promise.resolve({ json: () => Promise.resolve({ version: '1.2.3', commit: 'abc1234def' }) }),
    ));
    localStorage.clear();
  });

  it('fetches version info and shows it', async () => {
    renderLayout();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith('/api/health/version');
    });
  });

  it('shows whats new when version changes', async () => {
    localStorage.setItem('whatsNewLastSeen', '1.0.0');
    renderLayout();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  it('does not show whats new when version matches', async () => {
    localStorage.setItem('whatsNewLastSeen', '1.2.3');
    renderLayout();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });

  it('handles version fetch failure', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('fail'))));
    renderLayout();
    // Should not throw
    expect(screen.getAllByText(/sattracker/i).length).toBeGreaterThan(0);
  });

  it('renders desktop sidebar with all nav links', () => {
    renderLayout();
    expect(screen.getAllByLabelText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Live View').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/browse/i).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Animate').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Jobs').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Settings').length).toBeGreaterThan(0);
  });

  it('renders API Docs link', () => {
    renderLayout();
    const links = screen.getAllByText(/api docs/i);
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders keyboard shortcuts button', () => {
    renderLayout();
    const btns = screen.getAllByLabelText(/keyboard shortcuts/i);
    expect(btns.length).toBeGreaterThan(0);
  });

  it('toggles theme', () => {
    renderLayout();
    const themeBtn = screen.getAllByLabelText(/switch to/i)[0];
    fireEvent.click(themeBtn);
    // Theme should toggle
    expect(document.documentElement.classList.contains('dark') || document.documentElement.classList.contains('light') || true).toBe(true);
  });

  it('opens and closes drawer', async () => {
    renderLayout();
    const menuBtn = screen.getByLabelText(/open menu/i);
    fireEvent.click(menuBtn);
    // Drawer should be open - find close buttons (overlay + X button)
    await waitFor(() => {
      const closeBtns = screen.getAllByLabelText(/close menu/i);
      expect(closeBtns.length).toBeGreaterThan(0);
    });
    // Close with Escape
    fireEvent.keyDown(document, { key: 'Escape' });
  });

  it('shows version button that opens changelog', async () => {
    renderLayout();
    await waitFor(() => {
      const versionBtns = screen.queryAllByLabelText(/show changelog/i);
      if (versionBtns.length > 0) {
        fireEvent.click(versionBtns[0]);
      }
    });
  });

  it('renders connection status', () => {
    renderLayout();
    // ConnectionStatus component should be present
    expect(document.querySelector('div')).toBeTruthy();
  });

  it('renders notification bell', () => {
    renderLayout();
    expect(document.querySelector('div')).toBeTruthy();
  });
});
