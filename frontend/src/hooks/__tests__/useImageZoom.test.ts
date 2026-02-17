import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useImageZoom } from '../useImageZoom';

function makeWheelEvent(deltaY: number) {
  return { deltaY, preventDefault: () => {} } as unknown as React.WheelEvent;
}

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>) {
  return {
    touches,
    preventDefault: () => {},
  } as unknown as React.TouchEvent;
}

describe('useImageZoom', () => {
  it('starts at scale 1 with no zoom', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.style.transform).toContain('scale(1)');
  });

  it('zooms in on wheel scroll up', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);
    expect(result.current.style.transform).toContain('scale(1.15)');
  });

  it('zooms out on wheel scroll down but not below minScale', () => {
    const { result } = renderHook(() => useImageZoom());
    // Zoom in first
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    // Zoom out multiple times
    act(() => result.current.handlers.onWheel(makeWheelEvent(100)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(100)));
    act(() => result.current.handlers.onWheel(makeWheelEvent(100)));
    // Should reset to 1 (not go below)
    expect(result.current.isZoomed).toBe(false);
  });

  it('respects maxScale', () => {
    const { result } = renderHook(() => useImageZoom({ maxScale: 2 }));
    for (let i = 0; i < 20; i++) {
      act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    }
    expect(result.current.style.transform).toContain('scale(2)');
  });

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isZoomed).toBe(false);
  });

  it('double-tap toggles zoom', () => {
    const { result } = renderHook(() => useImageZoom({ doubleTapScale: 3 }));
    const touch = { clientX: 100, clientY: 100 };

    // First tap
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([touch])));
    act(() => result.current.handlers.onTouchEnd(makeTouchEvent([])));

    // Second tap within 300ms (simulated by same ref timestamp)
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([touch])));
    expect(result.current.isZoomed).toBe(true);
    expect(result.current.style.transform).toContain('scale(3)');

    // Double-tap again to reset
    act(() => result.current.handlers.onTouchEnd(makeTouchEvent([])));
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([touch])));
    act(() => result.current.handlers.onTouchEnd(makeTouchEvent([])));
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([touch])));
    expect(result.current.isZoomed).toBe(false);
  });

  it('returns proper cursor style when zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.style.cursor).toBe('default');
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.style.cursor).toBe('grab');
  });
});
