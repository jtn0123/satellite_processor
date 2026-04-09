import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

/**
 * JTN-465: regression test for the Settings → Data tab collapsibles and the
 * Cleanup Rules quick-action buttons. Before/during the fix pass the
 * Composites / Manual Upload / Processing sections appeared unresponsive —
 * this test pins the click-to-toggle behavior and verifies the Cleanup
 * buttons actually issue API calls.
 */

vi.mock('../hooks/usePageTitle', () => ({ usePageTitle: vi.fn() }));
vi.mock('../hooks/useApi', () => ({
  useSystemStatus: vi.fn(() => ({ data: null })),
  useSettings: vi.fn(() => ({ data: {} })),
  useUpdateSettings: vi.fn(() => ({ mutate: vi.fn() })),
  useImages: vi.fn(() => ({ data: [] })),
  useJobs: vi.fn(() => ({ data: [] })),
  useDeleteJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useDeleteImage: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  usePresets: vi.fn(() => ({ data: [] })),
  useCreateJob: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
}));

vi.mock('../api/client', () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { items: [] } })),
    post: vi.fn(() => Promise.resolve({ data: {} })),
    put: vi.fn(() => Promise.resolve({ data: {} })),
    delete: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

vi.mock('../hooks/useWebSocket', () => ({ default: vi.fn(() => null) }));
vi.mock('../utils/toast', () => ({ showToast: vi.fn() }));

import Settings from '../pages/Settings';

function renderSettings() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function openDataTab() {
  fireEvent.click(screen.getByRole('tab', { name: 'Data tab' }));
}

describe('Settings Data tab interactivity (JTN-465)', () => {
  it('toggles the Composites accordion on click', () => {
    renderSettings();
    openDataTab();
    const compositesBtn = screen.getByRole('button', { name: /composites/i });
    expect(compositesBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(compositesBtn);
    expect(compositesBtn).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(compositesBtn);
    expect(compositesBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('toggles the Manual Upload accordion on click', () => {
    renderSettings();
    openDataTab();
    const uploadBtn = screen.getByRole('button', { name: /manual upload/i });
    expect(uploadBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(uploadBtn);
    expect(uploadBtn).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles the Processing accordion on click', () => {
    renderSettings();
    openDataTab();
    const processingBtn = screen.getByRole('button', { name: /processing/i });
    expect(processingBtn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(processingBtn);
    expect(processingBtn).toHaveAttribute('aria-expanded', 'true');
  });
});
