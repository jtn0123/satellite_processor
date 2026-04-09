import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

const mockPresets = [
  {
    id: 'p1',
    name: 'My Preset',
    params: { fps: 30 },
    created_at: '2026-01-01T00:00:00Z',
  },
];

vi.mock('../hooks/useApi', () => ({
  usePresets: vi.fn(() => ({ data: mockPresets, isLoading: false })),
  useDeletePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useRenamePreset: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../hooks/usePageTitle', () => ({
  usePageTitle: vi.fn(),
}));

import Presets from '../pages/Presets';

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Presets page', () => {
  it('renders the page', () => {
    renderPage(<Presets />);
    expect(screen.getByRole('heading', { name: /presets/i })).toBeInTheDocument();
  });

  // JTN-389: when the user enters rename mode the input must receive
  // programmatic focus via the ref + useEffect pattern (replaces
  // autoFocus). This test locks in that behavior.
  it('focuses the rename input when entering edit mode', () => {
    renderPage(<Presets />);
    // Find the pencil rename button (aria-label set on the button)
    const editBtn = screen.getByLabelText(/rename preset/i);
    fireEvent.click(editBtn);
    // Input now visible with aria-label "Rename preset My Preset"
    const input = screen.getByLabelText(/Rename preset My Preset/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    // The ref-based effect runs inside the same synchronous React tick
    // as the click handler's state update, so the input is the active
    // element by the time the test continues.
    expect(document.activeElement).toBe(input);
  });
});
