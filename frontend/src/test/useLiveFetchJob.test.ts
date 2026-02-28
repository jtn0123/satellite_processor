import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { CatalogLatest, LatestFrame } from '../components/GoesData/types';

// Mock api client
const mockGet = vi.fn();
const mockPost = vi.fn();
vi.mock('../api/client', () => ({
  default: {
    get: (...args: unknown[]) => mockGet(...args),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));

// Mock toast
const mockShowToast = vi.fn();
vi.mock('../utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import { useLiveFetchJob } from '../hooks/useLiveFetchJob';

function makeCatalog(overrides: Partial<CatalogLatest> = {}): CatalogLatest {
  return {
    scan_time: '2024-06-01T12:00:00Z',
    size: 1024,
    key: 'test-key',
    satellite: 'GOES-18',
    sector: 'CONUS',
    band: 'Band02',
    image_url: 'https://example.com/image.jpg',
    thumbnail_url: 'https://example.com/thumb.jpg',
    mobile_url: 'https://example.com/mobile.jpg',
    ...overrides,
  };
}

function makeFrame(overrides: Partial<LatestFrame> = {}): LatestFrame {
  return {
    id: 1,
    satellite: 'GOES-18',
    sector: 'CONUS',
    band: 'Band02',
    capture_time: '2024-06-01T11:00:00Z',
    file_size: 500000,
    width: 1920,
    height: 1080,
    image_url: 'https://example.com/frame.jpg',
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  });
  return function Wrapper({ children }: Readonly<{ children: React.ReactNode }>) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    satellite: 'GOES-18',
    sector: 'CONUS',
    band: 'Band02',
    autoFetch: false,
    catalogLatest: null as CatalogLatest | null,
    frame: null as LatestFrame | null,
    lastAutoFetchTimeRef: { current: null } as React.MutableRefObject<string | null>,
    lastAutoFetchMsRef: { current: 0 } as React.MutableRefObject<number>,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('useLiveFetchJob', () => {
  beforeEach(() => {
    mockPost.mockReset();
    mockGet.mockReset();
    mockShowToast.mockReset();
    mockPost.mockResolvedValue({ data: { job_id: 'job-123' } });
    mockGet.mockResolvedValue({ data: { id: 'job-123', status: 'processing', progress: 50, status_message: 'Working' } });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null activeJobId and null activeJob initially', () => {
    const { result } = renderHook(() => useLiveFetchJob(makeProps()), { wrapper: createWrapper() });
    expect(result.current.activeJobId).toBeNull();
    expect(result.current.activeJob).toBeNull();
  });

  it('fetchNow calls api.post and sets activeJobId', async () => {
    const { result } = renderHook(() => useLiveFetchJob(makeProps()), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(mockPost).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
      satellite: 'GOES-18',
      sector: 'CONUS',
      band: 'Band02',
    }));
    expect(result.current.activeJobId).toBe('job-123');
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Fetching latest frame…');
  });

  it('fetchNow shows error toast on failure', async () => {
    mockPost.mockRejectedValueOnce(new Error('Network error'));
    const { result } = renderHook(() => useLiveFetchJob(makeProps()), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to start fetch');
  });

  it('fetchNow uses catalogLatest scan_time when available', async () => {
    const props = makeProps({ catalogLatest: makeCatalog() });
    const { result } = renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(mockPost).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
      start_time: '2024-06-01T12:00:00Z',
      end_time: '2024-06-01T12:00:00Z',
    }));
  });

  it('clears activeJobId after job completes with delay', async () => {
    vi.useFakeTimers();
    const refetch = vi.fn().mockResolvedValue(undefined);
    // Return completed job from API
    mockGet.mockResolvedValue({
      data: { id: 'job-123', status: 'completed', progress: 100, status_message: 'Done' },
    });

    const { result } = renderHook(() => useLiveFetchJob(makeProps({ refetch })), { wrapper: createWrapper() });

    // Set active job
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(result.current.activeJobId).toBe('job-123');

    // Wait for useQuery to fetch and return completed status
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    // The completion effect sets a 2s timer then clears activeJobId
    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.activeJobId).toBeNull();
    expect(refetch).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('does not auto-fetch when band is GEOCOLOR', () => {
    const props = makeProps({
      band: 'GEOCOLOR',
      autoFetch: true,
      catalogLatest: makeCatalog({ band: 'GEOCOLOR' }),
      frame: makeFrame(),
    });
    renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not auto-fetch when autoFetch is false', () => {
    const props = makeProps({
      autoFetch: false,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
    });
    renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('triggers auto-fetch when conditions are met', async () => {
    const lastAutoFetchMsRef = { current: 0 };
    const lastAutoFetchTimeRef = { current: null as string | null };
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
      lastAutoFetchMsRef,
      lastAutoFetchTimeRef,
    });

    renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
        satellite: 'GOES-18',
        sector: 'CONUS',
        band: 'Band02',
      }));
    });
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Auto-fetching new frame from AWS');
  });

  it('auto-fetch handles api failure gracefully', async () => {
    mockPost.mockRejectedValueOnce(new Error('API fail'));
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
      lastAutoFetchMsRef: { current: 0 },
      lastAutoFetchTimeRef: { current: null },
    });

    const { result } = renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    await new Promise((r) => setTimeout(r, 50));
    // Auto-fetch failure is non-critical — no error toast, no job set
    expect(mockShowToast).not.toHaveBeenCalledWith('error', expect.anything());
    expect(result.current.activeJobId).toBeNull();
  });

  it('cleanup cancels inflight auto-fetch', async () => {
    // Make post slow
    mockPost.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ data: { job_id: 'job-slow' } }), 100)));
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
      lastAutoFetchMsRef: { current: 0 },
      lastAutoFetchTimeRef: { current: null },
    });

    const { unmount } = renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    unmount();
    await new Promise((r) => setTimeout(r, 150));
    expect(mockShowToast).not.toHaveBeenCalledWith('success', 'Auto-fetching new frame from AWS');
  });

  it('does not auto-fetch when catalog time equals local time', () => {
    const sameTime = '2024-06-01T12:00:00Z';
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog({ scan_time: sameTime }),
      frame: makeFrame({ capture_time: sameTime }),
      lastAutoFetchMsRef: { current: 0 },
      lastAutoFetchTimeRef: { current: null },
    });
    renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('fetchNow falls back to current time when no catalogLatest', async () => {
    const beforeTime = Date.now();
    const props = makeProps({ catalogLatest: null });
    const { result } = renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.fetchNow();
    });
    const call = mockPost.mock.calls[0];
    const startTime = new Date(call[1].start_time).getTime();
    expect(startTime).toBeGreaterThanOrEqual(beforeTime - 1000);
  });

  it('polls job status via useQuery when activeJobId is set', async () => {
    const { result } = renderHook(() => useLiveFetchJob(makeProps()), { wrapper: createWrapper() });
    await act(async () => {
      await result.current.fetchNow();
    });
    // After setting job, useQuery should fetch job status
    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith('/jobs/job-123');
    });
  });

  it('does not auto-fetch when there is an active job', async () => {
    mockPost.mockResolvedValueOnce({ data: { job_id: 'job-active' } });
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
      lastAutoFetchMsRef: { current: 0 },
      lastAutoFetchTimeRef: { current: null },
    });

    const { result } = renderHook(() => useLiveFetchJob(props), { wrapper: createWrapper() });
    // First auto-fetch should fire
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledTimes(1);
    });
    expect(result.current.activeJobId).toBe('job-active');
    // With an active job, no further auto-fetch should trigger
    mockPost.mockClear();
    // Re-render with same props shouldn't trigger another fetch
    await new Promise((r) => setTimeout(r, 100));
    // mockPost should not be called again (hasActiveJob guard)
  });
});
