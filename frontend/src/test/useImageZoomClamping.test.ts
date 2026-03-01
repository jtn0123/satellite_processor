import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { clampTranslate, useImageZoom } from '../hooks/useImageZoom';
import type { RefObject } from 'react';

function makeTouchEvent(touches: Array<{ clientX: number; clientY: number }>) {
  return { touches, preventDefault: () => {} } as unknown as React.TouchEvent;
}

function makeMouseEvent(clientX: number, clientY: number) {
  return { clientX, clientY } as unknown as React.MouseEvent;
}

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

describe('clampTranslate', () => {
  it('returns zero translate at scale 1', () => {
    const result = clampTranslate(100, 200, 1, 400, 300);
    expect(result).toEqual({ tx: 0, ty: 0 });
  });

  it('returns zero translate at scale < 1', () => {
    const result = clampTranslate(50, 50, 0.5, 400, 300);
    expect(result).toEqual({ tx: 0, ty: 0 });
  });

  it('clamps translate at scale 2 with 400x300 container', () => {
    // maxX = (400 * (2-1)) / 2 = 200, maxY = (300 * (2-1)) / 2 = 150
    expect(clampTranslate(300, 200, 2, 400, 300)).toEqual({ tx: 200, ty: 150 });
    expect(clampTranslate(-300, -200, 2, 400, 300)).toEqual({ tx: -200, ty: -150 });
  });

  it('passes through values within bounds', () => {
    expect(clampTranslate(50, -30, 2, 400, 300)).toEqual({ tx: 50, ty: -30 });
  });

  it('handles scale 3 correctly', () => {
    // maxX = (400 * 2) / 2 = 400, maxY = (300 * 2) / 2 = 300
    expect(clampTranslate(500, 400, 3, 400, 300)).toEqual({ tx: 400, ty: 300 });
  });

  it('handles zero-size container', () => {
    expect(clampTranslate(100, 100, 2, 0, 0)).toEqual({ tx: 0, ty: 0 });
  });
});

describe('useImageZoom with containerRef (pan clamping)', () => {
  it('clamps touch pan to container bounds', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    // Zoom in (scale 2.5) — maxX = (400 * 1.5) / 2 = 300, maxY = (300 * 1.5) / 2 = 225
    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);

    // Start pan
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }])));
    // Move far right — should be clamped
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 600, clientY: 500 }])));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    expect(tx).toBeLessThanOrEqual(300);
    expect(ty).toBeLessThanOrEqual(225);
  });

  it('clamps mouse drag to container bounds', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    // Zoom in
    act(() => result.current.zoomIn());
    // Mouse drag far
    act(() => result.current.handlers.onMouseDown(makeMouseEvent(100, 100)));
    act(() => result.current.handlers.onMouseMove(makeMouseEvent(700, 600)));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    expect(tx).toBeLessThanOrEqual(300);
    expect(ty).toBeLessThanOrEqual(225);
  });

  it('snap-back on touch end clamps out-of-bounds translate', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    act(() => result.current.zoomIn());
    // Touch end triggers clamp
    act(() => result.current.handlers.onTouchEnd({} as React.TouchEvent));

    const transform = result.current.style.transform as string;
    expect(transform).toContain('translate(0px, 0px)');
  });

  it('snap-back on mouse up clamps out-of-bounds translate', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    act(() => result.current.zoomIn());
    act(() => result.current.handlers.onMouseUp());

    const transform = result.current.style.transform as string;
    expect(transform).toContain('translate(0px, 0px)');
  });

  it('scale=1 resets translate to zero', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    act(() => result.current.zoomIn());
    act(() => result.current.reset());
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.style.transform).toContain('translate(0px, 0px) scale(1)');
  });

  it('null containerRef does not crash', () => {
    const containerRef: RefObject<HTMLElement | null> = { current: null };
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    act(() => result.current.zoomIn());
    // Pan should work unclamped (no crash)
    act(() => result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 0, clientY: 0 }])));
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 999, clientY: 999 }])));
    expect(result.current.style.transform).toContain('translate(');
  });

  it('clamps translate after wheel zoom scale change', () => {
    const containerRef = makeContainerRef(200, 200);
    const { result } = renderHook(() => useImageZoom({ containerRef, maxScale: 3 }));

    // Zoom in via wheel
    for (let i = 0; i < 10; i++) {
      act(() => result.current.handlers.onWheel(makeWheelEvent(-100)));
    }
    expect(result.current.isZoomed).toBe(true);
    // Translate should be within bounds (0,0 since we haven't panned)
    expect(result.current.style.transform).toContain('translate(0px, 0px)');
  });
});
