import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useImageZoom } from '../useImageZoom';
import type { RefObject } from 'react';

function makeWheelEvent(deltaY: number) {
  return { deltaY, preventDefault: () => {} } as unknown as React.WheelEvent;
}

function makeContainerRef(width: number, height: number): RefObject<HTMLElement> {
  return {
    current: {
      getBoundingClientRect: () => ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0, toJSON: () => ({}) }),
    } as unknown as HTMLElement,
  };
}

function makeImageRef(naturalWidth: number, naturalHeight: number): RefObject<HTMLImageElement> {
  const listeners: Record<string, Array<() => void>> = {};
  return {
    current: {
      naturalWidth,
      naturalHeight,
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = listeners[event] ?? [];
        listeners[event].push(fn);
      },
      removeEventListener: (event: string, fn: () => void) => {
        listeners[event] = (listeners[event] ?? []).filter((f) => f !== fn);
      },
    } as unknown as HTMLImageElement,
  };
}

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>) {
  return { touches, preventDefault: () => {} } as unknown as React.TouchEvent;
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

  it('zoomIn sets scale to doubleTapScale', () => {
    const { result } = renderHook(() => useImageZoom({ doubleTapScale: 3 }));

    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);
    expect(result.current.style.transform).toContain('scale(3)');

    // reset returns to default
    act(() => result.current.reset());
    expect(result.current.isZoomed).toBe(false);
  });

  it('returns proper cursor style when zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.style.cursor).toBe('default');
    act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    expect(result.current.style.cursor).toBe('grab');
  });

  it('uses imageRef aspect ratio for pan clamping', () => {
    const containerRef = makeContainerRef(400, 700);
    const imageRef = makeImageRef(500, 300); // 5:3 aspect
    const { result } = renderHook(() => useImageZoom({ containerRef, imageRef }));

    // Zoom in to 2.5x
    act(() => result.current.zoomIn());

    // Pan far — should clamp using rendered image dimensions
    // renderedW=400, renderedH=240, maxX=300, maxY=0
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 0, clientY: 0 }])));
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 500, clientY: 500 }])));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    expect(tx).toBeLessThanOrEqual(300);
    expect(Math.abs(ty)).toBe(0); // No vertical pan allowed for landscape in tall container
  });

  it('falls back to 5:3 aspect when imageRef is null', () => {
    const containerRef = makeContainerRef(400, 700);
    const imageRef: RefObject<HTMLImageElement | null> = { current: null };
    const { result } = renderHook(() => useImageZoom({ containerRef, imageRef }));

    act(() => result.current.zoomIn());
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 0, clientY: 0 }])));
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 500, clientY: 500 }])));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    // Should still clamp correctly using default 5:3
    expect(Number(match[1])).toBeLessThanOrEqual(300);
    expect(Math.abs(Number(match[2]))).toBe(0);
  });
});
