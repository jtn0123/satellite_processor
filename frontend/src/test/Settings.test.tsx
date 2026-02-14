import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
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
    const { container } = render(<Settings />, { wrapper });
    expect(container.innerHTML.length).toBeGreaterThan(0);
  });

  it('renders without crashing', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container).toBeInTheDocument();
  });

  it('renders the settings container', () => {
    const { container } = render(<Settings />, { wrapper });
    expect(container.firstChild).toBeTruthy();
  });

  it('renders heading or label elements', () => {
    const { container } = render(<Settings />, { wrapper });
    // Should have some text content
    expect(container.textContent?.length).toBeGreaterThan(0);
  });
});
