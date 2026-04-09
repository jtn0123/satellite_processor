import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// JTN-389 regression: entering rename mode must focus the input via a
// ref + useEffect pattern instead of the old autoFocus prop. The
// production component only renames through the TanStack Query queries
// so we stub the network layer out wholesale.

const mockPresets = [
  {
    id: 'p1',
    name: 'Golden Hour',
    fps: 30,
    quality: 'high',
  },
];

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: mockPresets })),
    post: vi.fn(() => Promise.resolve({ data: mockPresets[0] })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
    patch: vi.fn(() => Promise.resolve({ data: mockPresets[0] })),
  },
}));

vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

import AnimationPresets from '../components/Animation/AnimationPresets';

async function renderPresets() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const config = {
    fps: 30,
    format: 'mp4' as const,
    quality: 'high' as const,
    resolution: '1080p' as const,
    loop_style: 'none' as const,
    overlays: [],
  } as never;
  render(
    <QueryClientProvider client={qc}>
      <AnimationPresets config={config} onLoadPreset={vi.fn()} />
    </QueryClientProvider>,
  );
  // Wait for the preset list to load from the mocked query
  await screen.findByText(/Golden Hour/i);
}

describe('AnimationPresets rename focus (JTN-389)', () => {
  it('focuses the rename input when entering edit mode', async () => {
    await renderPresets();
    // Find the rename button — aria-label="Rename" on the Edit2 icon button
    const editBtn = screen.getByLabelText('Rename');
    fireEvent.click(editBtn);
    const input = screen.getByLabelText(/rename preset/i) as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });
});
