import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../components/Layout';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: {} })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

function renderWithRouter(initialRoute = '/') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialRoute]}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<div data-testid="dashboard-page">Dashboard</div>} />
            <Route path="live" element={<div data-testid="live-page">Live</div>} />
            <Route path="animate" element={<div data-testid="animate-page">Animate</div>} />
            <Route path="goes" element={<div data-testid="goes-page">Browse & Fetch</div>} />
            <Route path="jobs" element={<div data-testid="jobs-page">Jobs</div>} />
            <Route path="settings" element={<div data-testid="settings-page">Settings</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Navigation Restructure', () => {
  describe('Sidebar renders all 6 nav items', () => {
    it('renders Dashboard link', () => {
      renderWithRouter();
      expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    });

    it('renders Live link', () => {
      renderWithRouter();
      expect(screen.getAllByText('Live').length).toBeGreaterThan(0);
    });

    it('renders Browse & Fetch link', () => {
      renderWithRouter();
      expect(screen.getAllByText('Browse & Fetch').length).toBeGreaterThan(0);
    });

    it('renders Animate link', () => {
      renderWithRouter();
      expect(screen.getAllByText('Animate').length).toBeGreaterThan(0);
    });

    it('renders Jobs link', () => {
      renderWithRouter();
      expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
    });

    it('renders Settings link', () => {
      renderWithRouter();
      expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
    });

    it('has exactly 7 nav items in sidebar (includes Error Logs in dev)', () => {
      renderWithRouter();
      // Both desktop and mobile have links, so we check desktop sidebar links
      const navLinks = document.querySelectorAll('aside nav a');
      expect(navLinks.length).toBe(7);
    });
  });

  describe('Old nav items are removed', () => {
    it('does not render Upload nav link', () => {
      renderWithRouter();
      const navLinks = document.querySelectorAll('aside nav a');
      const labels = Array.from(navLinks).map((l) => l.textContent?.trim());
      expect(labels).not.toContain('Upload');
    });

    it('does not render Process nav link', () => {
      renderWithRouter();
      const navLinks = document.querySelectorAll('aside nav a');
      const labels = Array.from(navLinks).map((l) => l.textContent?.trim());
      expect(labels).not.toContain('Process');
    });

    it('does not render Presets nav link', () => {
      renderWithRouter();
      const navLinks = document.querySelectorAll('aside nav a');
      const labels = Array.from(navLinks).map((l) => l.textContent?.trim());
      expect(labels).not.toContain('Presets');
    });
  });

  describe('New routes work', () => {
    it('/live route renders LiveView page', () => {
      renderWithRouter('/live');
      expect(screen.getByTestId('live-page')).toBeInTheDocument();
    });

    it('/animate route renders Animate page', () => {
      renderWithRouter('/animate');
      expect(screen.getByTestId('animate-page')).toBeInTheDocument();
    });

    it('/goes route renders GoesData page', () => {
      renderWithRouter('/goes');
      expect(screen.getByTestId('goes-page')).toBeInTheDocument();
    });

    it('/ route renders Dashboard', () => {
      renderWithRouter('/');
      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
    });
  });

  describe('Mobile drawer matches sidebar', () => {
    it('mobile drawer has same 7 nav items (includes Error Logs in dev)', () => {
      renderWithRouter();
      fireEvent.click(screen.getByLabelText('Open menu'));
      const dialog = screen.getByLabelText('Navigation menu');
      const mobileLinks = dialog.querySelectorAll('nav a');
      expect(mobileLinks.length).toBe(7);
      const labels = Array.from(mobileLinks).map((l) => l.textContent?.trim());
      expect(labels).toContain('Dashboard');
      expect(labels).toContain('Live');
      expect(labels).toContain('Browse & Fetch');
      expect(labels).toContain('Animate');
      expect(labels).toContain('Jobs');
      expect(labels).toContain('Settings');
      expect(labels).toContain('Error Logs');
    });
  });
});
