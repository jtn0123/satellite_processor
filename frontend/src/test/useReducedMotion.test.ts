import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReducedMotion } from '../hooks/useReducedMotion';

describe('useReducedMotion', () => {
  let listeners: (() => void)[];

  function mockMatchMedia(matches: boolean) {
    listeners = [];
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches,
      addEventListener: (_event: string, cb: () => void) => {
        listeners.push(cb);
      },
      removeEventListener: vi.fn(),
    })));
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns false when no reduced motion preference', () => {
    mockMatchMedia(false);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);
  });

  it('returns true when reduced motion is preferred', () => {
    mockMatchMedia(true);
    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(true);
  });

  it('updates when the media query changes', () => {
    let currentMatches = false;
    listeners = [];

    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      get matches() {
        return currentMatches;
      },
      addEventListener: (_event: string, cb: () => void) => {
        listeners.push(cb);
      },
      removeEventListener: vi.fn(),
    })));

    const { result } = renderHook(() => useReducedMotion());
    expect(result.current).toBe(false);

    // Simulate system preference change
    currentMatches = true;
    act(() => {
      for (const cb of listeners) cb();
    });

    expect(result.current).toBe(true);
  });

  it('cleans up event listener on unmount', () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal('matchMedia', vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener,
    })));

    const { unmount } = renderHook(() => useReducedMotion());
    unmount();

    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
