import { renderHook, act } from '@testing-library/react';
import { useMonitorWebSocket } from '../useMonitorWebSocket';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState = 0;
  close = vi.fn(() => {
    this.readyState = 3;
    this.onclose?.();
  });

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
}

// Mock dependencies
vi.mock('../../api/ws', () => ({
  buildWsUrl: (path: string) => `ws://localhost${path}`,
}));

vi.mock('../../utils/toast', () => ({
  showToast: vi.fn(),
}));

describe('useMonitorWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('does not connect when disabled', () => {
    renderHook(() => useMonitorWebSocket(false));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('connects when enabled', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.connected).toBe(false);
  });

  it('sets connected on open', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));
    act(() => {
      MockWebSocket.instances[0].onopen?.();
    });
    expect(result.current.connected).toBe(true);
  });

  it('handles frame_ingested message matching filter', () => {
    const { result } = renderHook(() =>
      useMonitorWebSocket(true, { satellite: 'GOES-16', sector: 'CONUS', band: 'C02' })
    );
    act(() => {
      MockWebSocket.instances[0].onopen?.();
    });
    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: 'frame_ingested',
          satellite: 'GOES-16',
          sector: 'CONUS',
          band: 'C02',
          capture_time: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        }),
      });
    });
    expect(result.current.lastEvent).not.toBeNull();
    expect(result.current.lastEvent?.type).toBe('frame_ingested');
  });

  it('ignores non-matching frame_ingested messages', () => {
    const { result } = renderHook(() =>
      useMonitorWebSocket(true, { satellite: 'GOES-16', sector: 'CONUS', band: 'C02' })
    );
    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: 'frame_ingested',
          satellite: 'GOES-18',
          sector: 'CONUS',
          band: 'C02',
          capture_time: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        }),
      });
    });
    expect(result.current.lastEvent).toBeNull();
  });

  it('handles job_completed messages', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));
    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({ type: 'job_completed' }),
      });
    });
    expect(result.current.lastEvent).not.toBeNull();
  });

  it('handles malformed JSON gracefully', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));
    act(() => {
      MockWebSocket.instances[0].onmessage?.({ data: 'not json' });
    });
    expect(result.current.lastEvent).toBeNull();
  });

  it('reconnects with exponential backoff on close', () => {
    renderHook(() => useMonitorWebSocket(true));
    expect(MockWebSocket.instances).toHaveLength(1);

    // Simulate close
    act(() => {
      MockWebSocket.instances[0].onclose?.();
    });

    // First reconnect after base delay (5000ms)
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Close again, next delay is 10000
    act(() => {
      MockWebSocket.instances[1].onclose?.();
    });
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('resets retry count on successful connection', () => {
    renderHook(() => useMonitorWebSocket(true));

    // Close and reconnect
    act(() => { MockWebSocket.instances[0].onclose?.(); });
    act(() => { vi.advanceTimersByTime(5000); });
    expect(MockWebSocket.instances).toHaveLength(2);

    // Open successfully resets retry count
    act(() => { MockWebSocket.instances[1].onopen?.(); });
    act(() => { MockWebSocket.instances[1].onclose?.(); });

    // Should reconnect at base delay again (5000), not 10000
    act(() => { vi.advanceTimersByTime(5000); });
    expect(MockWebSocket.instances).toHaveLength(3);
  });

  it('handles onerror by closing', () => {
    renderHook(() => useMonitorWebSocket(true));
    act(() => {
      MockWebSocket.instances[0].onerror?.();
    });
    expect(MockWebSocket.instances[0].close).toHaveBeenCalled();
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useMonitorWebSocket(true));
    const ws = MockWebSocket.instances[0];
    unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it('connects without filter', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));
    act(() => {
      MockWebSocket.instances[0].onmessage?.({
        data: JSON.stringify({
          type: 'frame_ingested',
          satellite: 'GOES-16',
          sector: 'CONUS',
          band: 'C02',
          capture_time: '2024-01-01T00:00:00Z',
          timestamp: '2024-01-01T00:00:00Z',
        }),
      });
    });
    expect(result.current.lastEvent).not.toBeNull();
  });
});
