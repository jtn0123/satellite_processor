import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import React from 'react';
import type { CatalogLatest, LatestFrame } from '../components/GoesData/types';

// Mock api client
const mockPost = vi.fn();
vi.mock('../api/client', () => ({
  default: { get: vi.fn(), post: (...args: unknown[]) => mockPost(...args) },
}));

// Mock toast
const mockShowToast = vi.fn();
vi.mock('../utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

// Mock useQuery
const mockUseQuery = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (...args: unknown[]) => mockUseQuery(...args),
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
    vi.useFakeTimers();
    mockUseQuery.mockReturnValue({ data: undefined });
    mockPost.mockResolvedValue({ data: { job_id: 'job-123' } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns null activeJobId and null activeJob initially', () => {
    const { result } = renderHook(() => useLiveFetchJob(makeProps()));
    expect(result.current.activeJobId).toBeNull();
    expect(result.current.activeJob).toBeNull();
  });

  it('fetchNow calls api.post and sets activeJobId', async () => {
    const { result } = renderHook(() => useLiveFetchJob(makeProps()));
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
    const { result } = renderHook(() => useLiveFetchJob(makeProps()));
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(mockShowToast).toHaveBeenCalledWith('error', 'Failed to start fetch');
  });

  it('fetchNow uses catalogLatest scan_time when available', async () => {
    const props = makeProps({
      catalogLatest: makeCatalog(),
    });
    const { result } = renderHook(() => useLiveFetchJob(props));
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(mockPost).toHaveBeenCalledWith('/goes/fetch', expect.objectContaining({
      start_time: '2024-06-01T12:00:00Z',
      end_time: '2024-06-01T12:00:00Z',
    }));
  });

  it('clears activeJobId after job completes with delay', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    // Return completed job from useQuery
    mockUseQuery.mockReturnValue({
      data: { id: 'job-123', status: 'completed', progress: 100, status_message: 'Done' },
    });

    const { result } = renderHook(() => useLiveFetchJob(makeProps({ refetch })));

    // Set active job first
    await act(async () => {
      await result.current.fetchNow();
    });
    expect(result.current.activeJobId).toBe('job-123');

    // Advance timer to trigger the completion cleanup
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.activeJobId).toBeNull();
    expect(refetch).toHaveBeenCalled();
  });

  it('clears activeJobId after job fails with delay', async () => {
    const refetch = vi.fn().mockResolvedValue(undefined);
    mockUseQuery.mockReturnValue({
      data: { id: 'job-123', status: 'failed', progress: 50, status_message: 'Error' },
    });

    const { result } = renderHook(() => useLiveFetchJob(makeProps({ refetch })));
    await act(async () => {
      await result.current.fetchNow();
    });
    await act(async () => {
      vi.advanceTimersByTime(2500);
    });
    expect(result.current.activeJobId).toBeNull();
    expect(refetch).toHaveBeenCalled();
  });

  it('does not auto-fetch when band is GEOCOLOR', () => {
    const props = makeProps({
      band: 'GEOCOLOR',
      autoFetch: true,
      catalogLatest: makeCatalog({ band: 'GEOCOLOR' }),
      frame: makeFrame(),
    });
    renderHook(() => useLiveFetchJob(props));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('does not auto-fetch when autoFetch is false', () => {
    const props = makeProps({
      autoFetch: false,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
    });
    renderHook(() => useLiveFetchJob(props));
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('triggers auto-fetch when conditions are met', async () => {
    vi.useRealTimers(); // Need real timers for async
    const lastAutoFetchMsRef = { current: 0 };
    const lastAutoFetchTimeRef = { current: null as string | null };
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
      lastAutoFetchMsRef,
      lastAutoFetchTimeRef,
    });

    renderHook(() => useLiveFetchJob(props));

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
    vi.useRealTimers();
    mockPost.mockRejectedValueOnce(new Error('API fail'));
    const props = makeProps({
      autoFetch: true,
      catalogLatest: makeCatalog(),
      frame: makeFrame(),
      lastAutoFetchMsRef: { current: 0 },
      lastAutoFetchTimeRef: { current: null },
    });

    // Should not throw
    renderHook(() => useLiveFetchJob(props));
    // Wait a tick to let async complete
    await new Promise((r) => setTimeout(r, 50));
    // No toast on auto-fetch failure (non-critical)
  });

  it('configures useQuery with correct parameters', () => {
    renderHook(() => useLiveFetchJob(makeProps()));
    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['live-job', null],
        enabled: false,
      }),
    );
  });
});
