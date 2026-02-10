import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SystemMonitor from '../components/System/SystemMonitor';

vi.mock('../hooks/useApi', () => ({
  useSystemStatus: () => ({
    data: {
      cpu_percent: 25.5,
      memory: { total: 16e9, available: 8e9, percent: 50 },
      disk: { total: 500e9, free: 250e9, percent: 50 },
    },
    isLoading: false,
  }),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

describe('SystemMonitor', () => {
  it('renders system stats', () => {
    const { container } = render(<SystemMonitor />, { wrapper });
    expect(container.textContent).toContain('CPU');
  });
});
