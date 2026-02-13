import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import Settings from '../pages/Settings';

vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Settings', () => {
  it('renders settings page', () => {
    render(<Settings />, { wrapper });
    // Should show loading or settings heading
    expect(document.body.textContent).toBeTruthy();
  });

  it('renders without crashing', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container).toBeInTheDocument();
  });
});
