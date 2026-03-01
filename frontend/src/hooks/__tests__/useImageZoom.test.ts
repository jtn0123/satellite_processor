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

  it('uses imageRef aspect ratio for pan clamping (non-default aspect)', () => {
    // Use a square (1:1) image in a wide container to produce different bounds than 5:3 default
    const containerRef = makeContainerRef(600, 400);
    const imageRef = makeImageRef(400, 400); // 1:1 aspect
    const { result } = renderHook(() => useImageZoom({ containerRef, imageRef }));

    act(() => result.current.zoomIn()); // scale 2.5

    // 1:1 in 600x400: renderedW = min(600, 400*1) = 400, renderedH = min(400, 600/1) = 400
    // maxX = max(0, (400*2.5 - 600)/2) = max(0, 200) = 200
    // maxY = max(0, (400*2.5 - 400)/2) = max(0, 300) = 300
    // With default 5:3: renderedW = min(600, 400*5/3) = min(600, 666.7) = 600, renderedH = min(400, 600/5*3) = min(400, 360) = 360
    // maxX would be (600*2.5 - 600)/2 = 450, maxY = (360*2.5 - 400)/2 = 250
    // So maxX=200 (with imageRef) vs 450 (without) — distinct!

    act(() => result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 0, clientY: 0 }])));
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 500, clientY: 500 }])));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    // With imageRef (1:1): maxX=200, without (5:3 fallback): maxX=450
    expect(tx).toBe(200); // Proves imageRef aspect is used, not the 5:3 default
    expect(ty).toBe(300);
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
