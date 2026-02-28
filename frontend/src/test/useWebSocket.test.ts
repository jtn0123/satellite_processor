import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../hooks/useWebSocket';

// Mock buildWsUrl
vi.mock('../api/ws', () => ({
  buildWsUrl: (path: string) => `ws://localhost${path}`,
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  url: string;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  readyState = 0;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
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

  it('should clear stale data and logs when jobId changes', () => {
    const { result, rerender } = renderHook(
      ({ jobId }) => useWebSocket(jobId),
      { initialProps: { jobId: 'job-1' as string | null } },
    );

    // Simulate data from first job
    act(() => MockWebSocket.instances[0].simulateOpen());
    act(() => {
      MockWebSocket.instances[0].simulateMessage({ progress: 50, message: 'halfway', status: 'processing' });
    });
    act(() => {
      MockWebSocket.instances[0].simulateMessage({ type: 'log', level: 'info', message: 'log entry' });
    });
    expect(result.current.data).not.toBeNull();
    expect(result.current.logs).toHaveLength(1);

    // Change jobId — data and logs should reset
    rerender({ jobId: 'job-2' });
    expect(result.current.data).toBeNull();
    expect(result.current.logs).toHaveLength(0);
  });
});
