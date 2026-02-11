import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Layout from '../components/Layout';

const fetchSpy = vi.fn(() =>
  Promise.resolve(new Response(JSON.stringify({ version: '2.1.0', sha: 'abc1234' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })),
);

beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy);
});

afterEach(() => {
  vi.restoreAllMocks();
});

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
    expect(screen.getAllByText('Upload').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Jobs').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
  });
});
