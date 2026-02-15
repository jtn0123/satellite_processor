import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { items: [], total: 0, limit: 20 } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({})),
  },
}));

vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import CollectionsTab from '../components/GoesData/CollectionsTab';

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe('CollectionsTab', () => {
  it('renders create collection input', () => {
    renderWithQuery(<CollectionsTab />);
    expect(screen.getByPlaceholderText(/collection name/i)).toBeInTheDocument();
  });
});
