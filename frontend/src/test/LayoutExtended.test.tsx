import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Layout extended', () => {
  it('renders GOES Data nav link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText(/GOES/i).length).toBeGreaterThan(0);
  });

  it('renders Process nav link', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText(/Process/i).length).toBeGreaterThan(0);
  });

  it('has theme toggle button', () => {
    render(<Layout />, { wrapper });
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders main content area', () => {
    const { container } = render(<Layout />, { wrapper });
    expect(container.querySelector('main')).toBeTruthy();
  });

  it('renders sidebar', () => {
    const { container } = render(<Layout />, { wrapper });
    // Should have sidebar/nav element
    expect(container.querySelector('nav, aside, [class*="sidebar"]')).toBeTruthy();
  });

  it('has accessible navigation', () => {
    render(<Layout />, { wrapper });
    const links = screen.getAllByRole('link');
    expect(links.length).toBeGreaterThan(0);
  });

  it('renders app branding', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText('SatTracker').length).toBeGreaterThan(0);
  });
});
