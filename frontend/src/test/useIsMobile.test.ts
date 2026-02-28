import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '../hooks/useIsMobile';

describe('useIsMobile', () => {
  it('returns false for desktop width', () => {
    vi.stubGlobal('innerWidth', 1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
    vi.unstubAllGlobals();
  });

  it('returns true for mobile width', () => {
    vi.stubGlobal('innerWidth', 375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
    vi.unstubAllGlobals();
  });

  it('responds to resize events', () => {
    vi.stubGlobal('innerWidth', 1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      vi.stubGlobal('innerWidth', 500);
      globalThis.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    vi.unstubAllGlobals();
  });
});
