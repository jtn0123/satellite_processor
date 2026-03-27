import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCountUp } from '../hooks/useCountUp';

describe('useCountUp', () => {
  let rafCallbacks: ((time: number) => void)[];
  let rafId: number;
  let originalRaf: typeof requestAnimationFrame;
  let originalCancelRaf: typeof cancelAnimationFrame;

  beforeEach(() => {
    rafCallbacks = [];
    rafId = 0;
    originalRaf = globalThis.requestAnimationFrame;
    originalCancelRaf = globalThis.cancelAnimationFrame;

    vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
      rafCallbacks.push(cb);
      return ++rafId;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.spyOn(performance, 'now').mockReturnValue(0);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  /** Flush all pending rAF callbacks at the given timestamp. */
  function flushRaf(time: number) {
    const pending = rafCallbacks.splice(0);
    for (const cb of pending) {
      cb(time);
    }
  }

  it('returns 0 initially', () => {
    const { result } = renderHook(() => useCountUp(100));
    expect(result.current).toBe(0);
  });

  it('animates toward the target value', () => {
    const duration = 800;
    const target = 100;
    const { result } = renderHook(() => useCountUp(target, duration));

    // Partway through
    act(() => {
      vi.spyOn(performance, 'now').mockReturnValue(0);
      flushRaf(400); // 50% elapsed
    });

    // With ease-out cubic at 50%: eased = 1 - (0.5)^3 = 0.875 => ~88
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(target);

    // Complete the animation
    act(() => {
      flushRaf(800); // 100% elapsed
    });

    expect(result.current).toBe(target);
  });

  it('reaches exact target at end of duration', () => {
    const { result } = renderHook(() => useCountUp(500, 800));

    // Kick off the first rAF, then complete
    act(() => flushRaf(800));

    expect(result.current).toBe(500);
  });

  it('updates when target changes', () => {
    const { result, rerender } = renderHook(({ target }) => useCountUp(target, 800), {
      initialProps: { target: 100 },
    });

    // Complete first animation
    act(() => flushRaf(800));
    expect(result.current).toBe(100);

    // Change target — reset performance.now baseline
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    rerender({ target: 200 });

    // Complete second animation
    act(() => flushRaf(1800));
    expect(result.current).toBe(200);
  });

  it('handles 0 to 0 (no animation needed)', () => {
    const { result } = renderHook(() => useCountUp(0));

    // No rAF should have been queued since diff === 0
    expect(rafCallbacks).toHaveLength(0);
    expect(result.current).toBe(0);
  });

  it('cancels animation frame on unmount', () => {
    const { unmount } = renderHook(() => useCountUp(100));

    unmount();

    expect(globalThis.cancelAnimationFrame).toHaveBeenCalled();
  });
});
