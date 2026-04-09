import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';

// Mock buildWsUrl and getWsApiKey
vi.mock('../api/ws', () => ({
  buildWsUrl: (path: string) => `ws://localhost${path}`,
  getWsApiKey: () => '',
}));

// Silence `reportError` side effects (writes to localStorage / console)
// so the test output stays clean.
vi.mock('../utils/errorReporter', () => ({
  reportError: vi.fn(),
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = 0;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.();
  }

  simulateOpen() {
    this.readyState = 1;
    this.onopen?.();
  }

  simulateMessage(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  simulateRawMessage(raw: string) {
    this.onmessage?.({ data: raw });
  }

  simulateError() {
    this.onerror?.();
  }
}

describe('useWebSocket', () => {
  beforeEach(() => {
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should not connect when jobId is null', () => {
    renderHook(() => useWebSocket(null));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it('should connect when jobId is provided', () => {
    renderHook(() => useWebSocket('job-123'));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://localhost/ws/jobs/job-123');
  });

  it('should set connected=true on open', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    expect(result.current.connected).toBe(false);

    act(() => {
      MockWebSocket.instances[0].simulateOpen();
    });
    expect(result.current.connected).toBe(true);
  });

  it('should parse progress messages', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'progress',
        progress: 50,
        message: 'Processing...',
      });
    });
    expect(result.current.data?.progress).toBe(50);
  });

  it('should collect log entries', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'log',
        level: 'info',
        message: 'Started',
        timestamp: '2024-01-01T00:00:00Z',
      });
    });
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].message).toBe('Started');
  });

  it('should attempt reconnection on close', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());

    const initialCount = MockWebSocket.instances.length;
    act(() => MockWebSocket.instances[0].close());

    expect(result.current.reconnecting).toBe(true);

    // Advance timer for reconnection
    act(() => vi.advanceTimersByTime(1500));
    expect(MockWebSocket.instances.length).toBeGreaterThan(initialCount);
  });

  it('should stop reconnecting on terminal state', () => {
    renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'status',
        status: 'completed',
        progress: 100,
        message: 'Done',
      });
    });

    const count = MockWebSocket.instances.length;
    act(() => MockWebSocket.instances[0].close());

    // Should not reconnect
    act(() => vi.advanceTimersByTime(5000));
    expect(MockWebSocket.instances.length).toBe(count);
  });

  it('should ignore ping messages in data', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: 'ping' });
    });
    expect(result.current.data).toBeNull();
  });

  it('exponential backoff doubles between retries', () => {
    renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());

    // First close → should queue a retry at 1000ms (2^0 * 1000)
    act(() => MockWebSocket.instances[0].close());
    expect(MockWebSocket.instances.length).toBe(1);
    // 999ms is too early
    act(() => vi.advanceTimersByTime(999));
    expect(MockWebSocket.instances.length).toBe(1);
    // 1ms more crosses the threshold
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances.length).toBe(2);

    // Second close → should wait 2000ms (2^1 * 1000)
    act(() => MockWebSocket.instances[1].close());
    act(() => vi.advanceTimersByTime(1999));
    expect(MockWebSocket.instances.length).toBe(2);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances.length).toBe(3);

    // Third close → should wait 4000ms (2^2 * 1000)
    act(() => MockWebSocket.instances[2].close());
    act(() => vi.advanceTimersByTime(3999));
    expect(MockWebSocket.instances.length).toBe(3);
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances.length).toBe(4);
  });

  it('stops reconnecting after maxRetries is reached', () => {
    const { result } = renderHook(() => useWebSocket('job-123', 2));

    // Close → retry 1 (delay 1000)
    act(() => MockWebSocket.instances[0].close());
    act(() => vi.advanceTimersByTime(1000));
    expect(MockWebSocket.instances.length).toBe(2);

    // Close → retry 2 (delay 2000)
    act(() => MockWebSocket.instances[1].close());
    act(() => vi.advanceTimersByTime(2000));
    expect(MockWebSocket.instances.length).toBe(3);

    // Third close → retriesRef is now 2 and maxRetries is 2 → stop
    act(() => MockWebSocket.instances[2].close());
    act(() => vi.advanceTimersByTime(60_000));
    expect(MockWebSocket.instances.length).toBe(3);
    expect(result.current.reconnecting).toBe(false);
  });

  it('closes socket and clears timer on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket('job-123'));
    const ws = MockWebSocket.instances[0];
    const closeSpy = vi.spyOn(ws, 'close');

    // Queue up a reconnect timer
    act(() => ws.simulateOpen());
    act(() => ws.close());

    // Unmount before the reconnect timer fires
    unmount();

    // Advance past the scheduled retry — no new socket should be created
    act(() => vi.advanceTimersByTime(30_000));
    expect(closeSpy).toHaveBeenCalled();
    expect(MockWebSocket.instances.length).toBe(1);
  });

  it('ignores connected/ping handshake messages', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());

    act(() => MockWebSocket.instances[0].simulateMessage({ type: 'connected' }));
    act(() => MockWebSocket.instances[0].simulateMessage({ type: 'ping' }));
    expect(result.current.data).toBeNull();

    // But a real progress message does land in data
    act(() =>
      MockWebSocket.instances[0].simulateMessage({
        type: 'progress',
        progress: 10,
        message: 'tick',
      }),
    );
    expect(result.current.data?.progress).toBe(10);
  });

  it('handles malformed JSON without throwing', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());

    expect(() => {
      act(() => MockWebSocket.instances[0].simulateRawMessage('not { valid json'));
    }).not.toThrow();
    expect(result.current.data).toBeNull();
  });

  it('fills in defaults for log entries with missing fields', () => {
    const { result } = renderHook(() => useWebSocket('job-123'));
    act(() => MockWebSocket.instances[0].simulateOpen());

    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: 'log' });
    });
    expect(result.current.logs).toHaveLength(1);
    expect(result.current.logs[0].level).toBe('info');
    expect(result.current.logs[0].message).toBe('');
    // Timestamp should be filled with a non-empty ISO string
    expect(result.current.logs[0].timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('calls ws.onerror handler without throwing', () => {
    renderHook(() => useWebSocket('job-123'));
    expect(() => {
      act(() => MockWebSocket.instances[0].simulateError());
    }).not.toThrow();
  });

  it('should clear stale data and logs when jobId changes', () => {
    const { result, rerender } = renderHook(({ jobId }) => useWebSocket(jobId), {
      initialProps: { jobId: 'job-1' as string | null },
    });

    // Simulate data from first job
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        progress: 50,
        message: 'halfway',
        status: 'processing',
      });
    });
    act(() => {
      MockWebSocket.instances[0].simulateMessage({
        type: 'log',
        level: 'info',
        message: 'log entry',
      });
    });
    expect(result.current.data).not.toBeNull();
    expect(result.current.logs).toHaveLength(1);

    // Change jobId — data and logs should reset
    rerender({ jobId: 'job-2' });
    expect(result.current.data).toBeNull();
    expect(result.current.logs).toHaveLength(0);
  });
});
