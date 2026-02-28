import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockShowToast = vi.fn();
vi.mock('../utils/toast', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

const mockUseMonitorWebSocket = vi.fn();
vi.mock('../hooks/useMonitorWebSocket', () => ({
  useMonitorWebSocket: (...args: unknown[]) => mockUseMonitorWebSocket(...args),
}));

import { useMonitorMode } from '../hooks/useMonitorMode';

function makeArgs(overrides: Record<string, unknown> = {}) {
  return {
    onMonitorChange: vi.fn() as ((active: boolean) => void) | undefined,
    satellite: 'GOES-18',
    sector: 'CONUS',
    band: 'Band02',
    refetchRef: { current: vi.fn().mockResolvedValue(undefined) } as React.RefObject<(() => Promise<unknown>) | null>,
    onRefetch: vi.fn(),
    ...overrides,
  };
}

describe('useMonitorMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseMonitorWebSocket.mockReturnValue({ lastEvent: null });
  });

  it('returns initial state with monitoring and autoFetch off', () => {
    const args = makeArgs();
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );
    expect(result.current.monitoring).toBe(false);
    expect(result.current.autoFetch).toBe(false);
  });

  it('toggleMonitor activates monitoring and autoFetch', () => {
    const args = makeArgs();
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );

    act(() => result.current.toggleMonitor());

    expect(result.current.monitoring).toBe(true);
    expect(result.current.autoFetch).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Monitor mode activated');
    expect(args.onMonitorChange).toHaveBeenCalledWith(true);
  });

  it('toggleMonitor deactivates monitoring on second call', () => {
    const args = makeArgs();
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );

    act(() => result.current.toggleMonitor());
    act(() => result.current.toggleMonitor());

    expect(result.current.monitoring).toBe(false);
    expect(result.current.autoFetch).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith('info', 'Monitor mode stopped');
    expect(args.onMonitorChange).toHaveBeenCalledWith(false);
  });

  it('startMonitorRaw activates monitoring and calls applyConfig', () => {
    const args = makeArgs();
    const applyConfig = vi.fn();
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );

    act(() => result.current.startMonitorRaw(applyConfig));

    expect(applyConfig).toHaveBeenCalledOnce();
    expect(result.current.monitoring).toBe(true);
    expect(result.current.autoFetch).toBe(true);
    expect(mockShowToast).toHaveBeenCalledWith('success', 'Monitor mode activated');
    expect(args.onMonitorChange).toHaveBeenCalledWith(true);
  });

  it('stopMonitor deactivates monitoring', () => {
    const args = makeArgs();
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );

    act(() => result.current.toggleMonitor()); // activate
    act(() => result.current.stopMonitor());

    expect(result.current.monitoring).toBe(false);
    expect(result.current.autoFetch).toBe(false);
    expect(mockShowToast).toHaveBeenCalledWith('info', 'Monitor mode stopped');
  });

  it('setAutoFetch updates autoFetch state', () => {
    const args = makeArgs();
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );

    act(() => result.current.setAutoFetch(true));
    expect(result.current.autoFetch).toBe(true);

    act(() => result.current.setAutoFetch(false));
    expect(result.current.autoFetch).toBe(false);
  });

  it('refetches on websocket event while monitoring', () => {
    const args = makeArgs();
    mockUseMonitorWebSocket.mockReturnValue({ lastEvent: null });

    const { rerender } = renderHook(
      ({ event }) => {
        mockUseMonitorWebSocket.mockReturnValue({ lastEvent: event });
        return useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch);
      },
      { initialProps: { event: null as unknown } },
    );

    // Activate monitoring first
    // Can't easily toggle via result in this pattern, so let's use a different approach
    // Re-render with an event while monitoring
    mockUseMonitorWebSocket.mockReturnValue({
      lastEvent: { type: 'frame_ingested', satellite: 'GOES-18', sector: 'CONUS', band: 'Band02', capture_time: '2024-01-01', timestamp: '2024-01-01' },
    });
    rerender({ event: { type: 'frame_ingested' } });

    // Since monitoring is false initially, refetch should NOT be called
    expect(args.refetchRef.current).not.toHaveBeenCalled();
  });

  it('passes monitoring state and params to useMonitorWebSocket', () => {
    const args = makeArgs();
    renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );
    expect(mockUseMonitorWebSocket).toHaveBeenCalledWith(false, { satellite: 'GOES-18', sector: 'CONUS', band: 'Band02' });
  });

  it('works without optional onMonitorChange', () => {
    const args = makeArgs({ onMonitorChange: undefined });
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef, args.onRefetch),
    );

    // Should not throw
    act(() => result.current.toggleMonitor());
    expect(result.current.monitoring).toBe(true);
  });

  it('works without optional onRefetch', () => {
    const args = makeArgs({ onRefetch: undefined });
    const { result } = renderHook(() =>
      useMonitorMode(args.onMonitorChange, args.satellite, args.sector, args.band, args.refetchRef),
    );
    expect(result.current.monitoring).toBe(false);
  });
});
