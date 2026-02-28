import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountdownDisplay } from '../hooks/useCountdownDisplay';

describe('useCountdownDisplay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns initial display based on interval', () => {
    const { result } = renderHook(() => useCountdownDisplay(300000));
    expect(result.current.display).toBe('5:00');
  });

  it('counts down over time', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdownDisplay(60000));

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should be around 0:59
    expect(result.current.display).toMatch(/0:5[89]/);
  });

  it('resets countdown when resetCountdown is called', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCountdownDisplay(60000));

    // Advance 30 seconds
    act(() => {
      vi.advanceTimersByTime(30000);
    });

    // Reset
    act(() => {
      result.current.resetCountdown();
    });

    // After 1 more second, should be near 0:59 again
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current.display).toMatch(/0:5[89]/);
  });

  it('handles short intervals', () => {
    const { result } = renderHook(() => useCountdownDisplay(5000));
    expect(result.current.display).toBe('0:05');
  });
});
