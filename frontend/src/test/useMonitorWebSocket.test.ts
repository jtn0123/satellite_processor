import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMonitorWebSocket } from '../hooks/useMonitorWebSocket';

// Mock toast
vi.mock('../utils/toast', () => ({
  showToast: vi.fn(),
}));

// Mock buildWsUrl
vi.mock('../api/ws', () => ({
  buildWsUrl: (path: string) => `ws://localhost${path}`,
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.closed = true;
    this.onclose?.();
  }

  simulateOpen() {
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateError() {
    this.onerror?.();
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useMonitorWebSocket', () => {
  it('does not connect when disabled', () => {
    renderHook(() => useMonitorWebSocket(false));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('connects and sets connected=true on open', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(result.current.connected).toBe(false);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    expect(result.current.connected).toBe(true);
  });

  it('handles frame_ingested messages matching filter', async () => {
    const { showToast } = await import('../utils/toast');
    const { result } = renderHook(() =>
      useMonitorWebSocket(true, { satellite: 'GOES-16', sector: 'CONUS', band: 'C02' }),
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateMessage({
        type: 'frame_ingested',
        satellite: 'GOES-16',
        sector: 'CONUS',
        band: 'C02',
        capture_time: '2024-01-01T00:00:00Z',
        timestamp: '2024-01-01T00:00:00Z',
      });
    });

    expect(result.current.lastEvent).not.toBeNull();
    expect(result.current.lastEvent?.type).toBe('frame_ingested');
    expect(showToast).toHaveBeenCalled();
  });

  it('ignores frame_ingested messages not matching filter', async () => {
    const { showToast } = await import('../utils/toast');
    (showToast as ReturnType<typeof vi.fn>).mockClear();

    const { result } = renderHook(() =>
      useMonitorWebSocket(true, { satellite: 'GOES-16', sector: 'CONUS', band: 'C02' }),
    );

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateMessage({
        type: 'frame_ingested',
        satellite: 'GOES-18',
        sector: 'FULL',
        band: 'C13',
        capture_time: '2024-01-01T00:00:00Z',
        timestamp: '2024-01-01T00:00:00Z',
      });
    });

    expect(result.current.lastEvent).toBeNull();
    expect(showToast).not.toHaveBeenCalled();
  });

  it('handles job_completed messages', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].simulateMessage({ type: 'job_completed' });
    });

    expect(result.current.lastEvent).not.toBeNull();
    expect(result.current.lastEvent?.type).toBe('frame_ingested');
  });

  it('reconnects on close', () => {
    renderHook(() => useMonitorWebSocket(true));
    expect(MockWebSocket.instances).toHaveLength(1);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      // Simulate close without going through .close() method to avoid recursion
      MockWebSocket.instances[0].onclose?.();
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it('closes WebSocket on error', () => {
    renderHook(() => useMonitorWebSocket(true));
    const ws = MockWebSocket.instances[0];

    act(() => {
      ws.simulateError();
    });

    expect(ws.closed).toBe(true);
  });

  it('cleans up on unmount', () => {
    const { unmount } = renderHook(() => useMonitorWebSocket(true));
    const ws = MockWebSocket.instances[0];

    unmount();
    expect(ws.closed).toBe(true);
  });

  it('ignores invalid JSON messages', () => {
    const { result } = renderHook(() => useMonitorWebSocket(true));

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
      MockWebSocket.instances[0].onmessage?.({ data: 'not-json' });
    });

    expect(result.current.lastEvent).toBeNull();
  });
});
