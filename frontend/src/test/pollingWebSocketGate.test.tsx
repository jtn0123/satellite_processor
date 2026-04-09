import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * JTN-415 regression guard.
 *
 * Before this PR the dashboard fired ~261 XHR/min against /api/jobs,
 * /api/stats, /api/health/detailed, and /api/notifications even though a
 * websocket was already connected and pushing the same data. These tests
 * stub out the ConnectionStatus hook that useApi reads from, spin the
 * query hooks with fake timers, and assert that:
 *
 *   1. Polling is fully disabled while the WS is "connected".
 *   2. Polling resumes at the original interval once it drops.
 */

const mockUseIsWebSocketConnected = vi.fn<() => boolean>();

vi.mock('../components/ConnectionStatus', () => ({
  useIsWebSocketConnected: () => mockUseIsWebSocketConnected(),
  default: () => null,
}));

const apiGet = vi.fn();

vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => apiGet(...args),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import { useJobs, useStats, useHealthDetailed } from '../hooks/useApi';

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

async function flushInitialFetch() {
  // Run microtask queue so the initial fetch promise resolves without
  // needing real timers (we're using fake timers in every test here).
  await vi.advanceTimersByTimeAsync(0);
}

describe('polling is gated on websocket connection (JTN-415)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    apiGet.mockReset();
    apiGet.mockResolvedValue({ data: { items: [] } });
    mockUseIsWebSocketConnected.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('useJobs does not poll while websocket is connected', async () => {
    mockUseIsWebSocketConnected.mockReturnValue(true);
    renderHook(() => useJobs(), { wrapper: makeWrapper() });

    await flushInitialFetch();
    const before = apiGet.mock.calls.length;
    // Advance a full minute of wall clock. With the old 5s poll that would
    // have produced ~12 more calls.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiGet.mock.calls.length).toBe(before);
  });

  it('useStats does not poll while websocket is connected', async () => {
    mockUseIsWebSocketConnected.mockReturnValue(true);
    renderHook(() => useStats(), { wrapper: makeWrapper() });

    await flushInitialFetch();
    const before = apiGet.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiGet.mock.calls.length).toBe(before);
  });

  it('useHealthDetailed does not poll while websocket is connected', async () => {
    mockUseIsWebSocketConnected.mockReturnValue(true);
    renderHook(() => useHealthDetailed(), { wrapper: makeWrapper() });

    await flushInitialFetch();
    const before = apiGet.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(apiGet.mock.calls.length).toBe(before);
  });

  it('useJobs polls when websocket is disconnected (fallback interval)', async () => {
    mockUseIsWebSocketConnected.mockReturnValue(false);
    renderHook(() => useJobs(), { wrapper: makeWrapper() });

    await flushInitialFetch();
    const before = apiGet.mock.calls.length;
    // Fallback is 5s — advance 16s and expect >=2 more fetches.
    await vi.advanceTimersByTimeAsync(16_000);
    expect(apiGet.mock.calls.length).toBeGreaterThanOrEqual(before + 2);
  });

  it('total polled traffic across the dashboard hooks stays under 20/min with WS up', async () => {
    mockUseIsWebSocketConnected.mockReturnValue(true);
    const wrapper = makeWrapper();
    renderHook(() => useJobs(), { wrapper });
    renderHook(() => useStats(), { wrapper });
    renderHook(() => useHealthDetailed(), { wrapper });

    await flushInitialFetch();
    await vi.advanceTimersByTimeAsync(60_000);
    // Initial fetches (<= 3) + zero polled refetches while WS is up.
    // Easily under the 20/min regression threshold from JTN-415.
    expect(apiGet.mock.calls.length).toBeLessThan(20);
  });
});
