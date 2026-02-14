import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ConnectionStatus from '../components/ConnectionStatus';

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(_url: string) {
    MockWebSocket.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ConnectionStatus', () => {
  it('renders nothing when disconnected (initial state)', () => {
    const { container } = render(<ConnectionStatus />);
    expect(container.innerHTML).toBe('');
  });

  it('does not render a status dot when disconnected', () => {
    const { container } = render(<ConnectionStatus />);
    const dot = container.querySelector('.rounded-full');
    expect(dot).toBeNull();
  });

  it('does not show Disconnected text (hidden by design)', () => {
    render(<ConnectionStatus />);
    expect(screen.queryByText('Disconnected')).not.toBeInTheDocument();
  });

  it('shows Connected when WebSocket opens', () => {
    // @ts-expect-error mock
    globalThis.WebSocket = MockWebSocket;
    const { unmount } = render(<ConnectionStatus />);

    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.onopen?.();
    });

    expect(screen.getByText('Connected')).toBeInTheDocument();
    unmount();
    // @ts-expect-error cleanup
    delete globalThis.WebSocket;
  });

  it('shows Reconnecting after close and retries', () => {
    // @ts-expect-error mock
    globalThis.WebSocket = MockWebSocket;
    const { unmount } = render(<ConnectionStatus />);

    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.onopen?.();
    });
    expect(screen.getByText('Connected')).toBeInTheDocument();

    act(() => {
      const ws = MockWebSocket.instances[0];
      ws.onclose?.();
    });
    expect(screen.getByText('Reconnecting')).toBeInTheDocument();

    unmount();
    // @ts-expect-error cleanup
    delete globalThis.WebSocket;
  });

  it('gives up after MAX_RETRIES and shows disconnected (null)', () => {
    // @ts-expect-error mock
    globalThis.WebSocket = MockWebSocket;
    const { container, unmount } = render(<ConnectionStatus />);

    // Exhaust 5 retries
    for (let i = 0; i < 6; i++) {
      act(() => {
        const ws = MockWebSocket.instances[MockWebSocket.instances.length - 1];
        ws.onclose?.();
        vi.runAllTimers();
      });
    }

    // After exhaustion, should be disconnected (renders null)
    expect(container.innerHTML).toBe('');

    unmount();
    // @ts-expect-error cleanup
    delete globalThis.WebSocket;
  });
});
