import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../hooks/useApi', () => ({
  usePresets: vi.fn(() => ({ data: [], isLoading: false })),
  useDeletePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRenamePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

import Presets from '../pages/Presets';

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

describe('Presets page', () => {
  it('renders the page', () => {
    renderPage(<Presets />);
    expect(screen.getByRole('heading', { name: /presets/i })).toBeInTheDocument();
  });
});
