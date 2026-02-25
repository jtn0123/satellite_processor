import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageZoom } from '../hooks/useImageZoom';

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>) {
  return { touches, preventDefault: () => {} } as unknown as React.TouchEvent;
}

function makeWheelEvent(deltaY: number) {
  return { deltaY, preventDefault: () => {} } as unknown as React.WheelEvent;
}

function makeMouseEvent(clientX: number, clientY: number) {
  return { clientX, clientY } as unknown as React.MouseEvent;
}

describe('useImageZoom', () => {
  it('initializes with scale 1 and not zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.style.transform).toContain('scale(1)');
  });

  it('zooms in on wheel scroll up', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);
  });

  it('resets to 1 on wheel scroll down past min', () => {
    const { result } = renderHook(() => useImageZoom());
    // Zoom in first
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);
    // Zoom out past 1
    for (let i = 0; i < 20; i++) {
      act(() => result.current.handlers.onWheel(makeWheelEvent(100)));
    }
    expect(result.current.isZoomed).toBe(false);
  });

  it('clamps scale to maxScale', () => {
    const { result } = renderHook(() => useImageZoom({ maxScale: 2 }));
    for (let i = 0; i < 20; i++) {
      act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    }
    // Should be zoomed but clamped
    expect(result.current.isZoomed).toBe(true);
    const match = result.current.style.transform?.toString().match(/scale\(([\d.]+)\)/);
    expect(Number(match?.[1])).toBeLessThanOrEqual(2);
  });

  it('reset brings scale back to 1', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isZoomed).toBe(false);
  });

  it('zoomIn toggles zoom', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);
    // reset returns to default
    act(() => result.current.reset());
    expect(result.current.isZoomed).toBe(false);
  });

  it('pinch zoom with two fingers', () => {
    const { result } = renderHook(() => useImageZoom());
    const startTouches = [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 200 },
    ];
    act(() => result.current.handlers.onTouchStart(makeTouchEvent(startTouches)));
    // Move fingers apart
    const moveTouches = [
      { clientX: 50, clientY: 50 },
      { clientX: 250, clientY: 250 },
    ];
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(moveTouches)));
    expect(result.current.isZoomed).toBe(true);
  });

  it('pinch zoom resets when pinched below scale 1', () => {
    const { result } = renderHook(() => useImageZoom());
    // First zoom in
    const startTouches = [
      { clientX: 100, clientY: 100 },
      { clientX: 200, clientY: 200 },
    ];
    act(() => result.current.handlers.onTouchStart(makeTouchEvent(startTouches)));
    const moveTouches = [
      { clientX: 50, clientY: 50 },
      { clientX: 250, clientY: 250 },
    ];
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(moveTouches)));
    // Now pinch in
    act(() => result.current.handlers.onTouchEnd({} as React.TouchEvent));
    // Start a new pinch from close together
    const closeTouches = [
      { clientX: 140, clientY: 140 },
      { clientX: 160, clientY: 160 },
    ];
    act(() => result.current.handlers.onTouchStart(makeTouchEvent(closeTouches)));
    // Move even closer (shrink)
    const veryClose = [
      { clientX: 149, clientY: 149 },
      { clientX: 151, clientY: 151 },
    ];
    act(() => result.current.handlers.onTouchMove(makeTouchEvent(veryClose)));
    expect(result.current.isZoomed).toBe(false);
  });

  it('touch pan when zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    // Zoom in via zoomIn method
    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);

    // Start pan
    const panStart = { clientX: 150, clientY: 150 };
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([panStart])));
    // Move
    const panMove = { clientX: 200, clientY: 200 };
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([panMove])));
    expect(result.current.style.transform).toContain('translate(');
  });

  it('touch end clears pinch and pan refs', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onTouchEnd({} as React.TouchEvent));
    // Should not throw
    expect(result.current.isZoomed).toBe(false);
  });

  it('mouse drag pans when zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    // Zoom in first
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.isZoomed).toBe(true);
    // Mouse down
    act(() => result.current.handlers.onMouseDown(makeMouseEvent(100, 100)));
    // Mouse move
    act(() => result.current.handlers.onMouseMove(makeMouseEvent(150, 120)));
    expect(result.current.style.transform).toContain('translate(');
    // Mouse up
    act(() => result.current.handlers.onMouseUp());
  });

  it('mouse drag does nothing when not zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onMouseDown(makeMouseEvent(100, 100)));
    act(() => result.current.handlers.onMouseMove(makeMouseEvent(150, 120)));
    expect(result.current.style.transform).toContain('translate(0px, 0px)');
  });

  it('mouse move without mousedown does nothing', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    const before = result.current.style.transform;
    act(() => result.current.handlers.onMouseMove(makeMouseEvent(150, 120)));
    expect(result.current.style.transform).toBe(before);
  });

  it('style has grab cursor when zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.style.cursor).toBe('default');
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.style.cursor).toBe('grab');
  });

  it('respects custom options', () => {
    const { result } = renderHook(() => useImageZoom({ minScale: 0.5, maxScale: 3, doubleTapScale: 2 }));
    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);
    const match = result.current.style.transform?.toString().match(/scale\(([\d.]+)\)/);
    expect(Number(match?.[1])).toBe(2);
  });

  it('touch move with single finger does nothing when not zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    const touch = { clientX: 100, clientY: 100 };
    // Single touch start (first tap, no double tap)
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([touch])));
    // Wait > 300ms by creating a fresh touch
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 150, clientY: 150 }])));
    // Should stay at 0,0 since not zoomed and panRef not set
    expect(result.current.style.transform).toContain('translate(0px, 0px)');
  });
});
