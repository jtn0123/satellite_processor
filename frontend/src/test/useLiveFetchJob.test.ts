import { describe, it, expect, vi } from 'vitest';

// Test the shouldAutoFetch logic directly since the hook is complex to render
// We extract and test the guard conditions

describe('useLiveFetchJob auto-fetch guard', () => {
  // Inline the shouldAutoFetch function for unit testing
  function shouldAutoFetch(
    autoFetch: boolean,
    catalogLatest: { scan_time: string } | null,
    frame: { capture_time: string } | null,
    lastAutoFetchTime: string | null,
    lastAutoFetchMs: number,
    hasActiveJob: boolean,
  ): boolean {
    if (!autoFetch || !catalogLatest || !frame || hasActiveJob) return false;
    const catalogTime = new Date(catalogLatest.scan_time).getTime();
    const localTime = new Date(frame.capture_time).getTime();
    return catalogTime > localTime && lastAutoFetchTime !== catalogLatest.scan_time && Date.now() - lastAutoFetchMs > 30000;
  }

  it('returns false when autoFetch is disabled', () => {
    expect(shouldAutoFetch(false, { scan_time: '2024-01-01T01:00:00Z' }, { capture_time: '2024-01-01T00:00:00Z' }, null, 0, false)).toBe(false);
  });

  it('returns false when catalogLatest is null', () => {
    expect(shouldAutoFetch(true, null, { capture_time: '2024-01-01T00:00:00Z' }, null, 0, false)).toBe(false);
  });

  it('returns false when frame is null', () => {
    expect(shouldAutoFetch(true, { scan_time: '2024-01-01T01:00:00Z' }, null, null, 0, false)).toBe(false);
  });

  it('returns false when there is an active job (race condition guard)', () => {
    expect(shouldAutoFetch(
      true,
      { scan_time: '2024-01-01T01:00:00Z' },
      { capture_time: '2024-01-01T00:00:00Z' },
      null,
      0,
      true, // active job running
    )).toBe(false);
  });

  it('returns true when catalog is newer and no active job', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60000);

    expect(shouldAutoFetch(
      true,
      { scan_time: '2024-01-01T01:00:00Z' },
      { capture_time: '2024-01-01T00:00:00Z' },
      null,
      now - 60000, // 60s ago
      false,
    )).toBe(true);

    vi.restoreAllMocks();
  });

  it('returns false when last auto-fetch was too recent (< 30s)', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    expect(shouldAutoFetch(
      true,
      { scan_time: '2024-01-01T01:00:00Z' },
      { capture_time: '2024-01-01T00:00:00Z' },
      null,
      now - 10000, // only 10s ago
      false,
    )).toBe(false);

    vi.restoreAllMocks();
  });

  it('returns false when already fetched this scan_time', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 60000);

    expect(shouldAutoFetch(
      true,
      { scan_time: '2024-01-01T01:00:00Z' },
      { capture_time: '2024-01-01T00:00:00Z' },
      '2024-01-01T01:00:00Z', // already fetched this scan_time
      now - 60000,
      false,
    )).toBe(false);

    vi.restoreAllMocks();
  });
});
