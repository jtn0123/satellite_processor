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

describe('Layout', () => {
  it('renders sidebar with app name', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText('SatTracker').length).toBeGreaterThan(0);
  });

  it('renders navigation links', () => {
    render(<Layout />, { wrapper });
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Live View').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Browse & Fetch').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Animate').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });
});
