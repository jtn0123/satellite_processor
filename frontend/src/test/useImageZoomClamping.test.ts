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

  it('clamps translate at scale 2 with 400x300 container (matching aspect)', () => {
    // 400x300 container, 4:3 image → rendered 400x300 (fills container)
    // maxX = max(0, (400*2 - 400)/2) = 200, maxY = max(0, (300*2 - 300)/2) = 150
    expect(clampTranslate(300, 200, 2, 400, 300, 4 / 3)).toEqual({ tx: 200, ty: 150 });
    expect(clampTranslate(-300, -200, 2, 400, 300, 4 / 3)).toEqual({ tx: -200, ty: -150 });
  });

  it('passes through values within bounds', () => {
    expect(clampTranslate(50, -30, 2, 400, 300, 4 / 3)).toEqual({ tx: 50, ty: -30 });
  });

  it('handles scale 3 with matching aspect', () => {
    // 400x300 container, 4:3 image → rendered 400x300
    // maxX = (400*3 - 400)/2 = 400, maxY = (300*3 - 300)/2 = 300
    expect(clampTranslate(500, 400, 3, 400, 300, 4 / 3)).toEqual({ tx: 400, ty: 300 });
  });

  it('handles zero-size container', () => {
    expect(clampTranslate(100, 100, 2, 0, 0)).toEqual({ tx: 0, ty: 0 });
  });

  it('clamps correctly for 5:3 landscape image in tall portrait container (400x700)', () => {
    // renderedW = min(400, 700 * 5/3) = min(400, 1166.7) = 400
    // renderedH = min(700, 400 / (5/3)) = min(700, 240) = 240
    // At scale 2: maxX = max(0, (400*2 - 400)/2) = 200
    //             maxY = max(0, (240*2 - 700)/2) = max(0, -110) = 0
    expect(clampTranslate(300, 100, 2, 400, 700, 5 / 3)).toEqual({ tx: 200, ty: 0 });
    const neg = clampTranslate(-300, -100, 2, 400, 700, 5 / 3);
    expect(neg.tx).toBe(-200);
    expect(Math.abs(neg.ty)).toBe(0);
  });

  it('clamps correctly for 5:3 image at scale 2.5 in portrait viewport', () => {
    // renderedW = 400, renderedH = 240
    // maxX = (400*2.5 - 400)/2 = 300
    // maxY = (240*2.5 - 700)/2 = max(0, (600-700)/2) = max(0, -50) = 0
    expect(clampTranslate(500, 200, 2.5, 400, 700, 5 / 3)).toEqual({ tx: 300, ty: 0 });
  });

  it('clamps correctly for square image (1:1) in portrait container', () => {
    // 400x700 container, 1:1 image
    // renderedW = min(400, 700*1) = 400
    // renderedH = min(700, 400/1) = 400
    // At scale 2: maxX = (400*2 - 400)/2 = 200
    //             maxY = (400*2 - 700)/2 = max(0, 50) = 50
    expect(clampTranslate(300, 100, 2, 400, 700, 1)).toEqual({ tx: 200, ty: 50 });
  });

  it('uses default 5:3 aspect when imageAspect is omitted', () => {
    // Same as explicit 5/3 test
    const withDefault = clampTranslate(300, 100, 2, 400, 700);
    const withExplicit = clampTranslate(300, 100, 2, 400, 700, 5 / 3);
    expect(withDefault).toEqual(withExplicit);
  });
});

describe('useImageZoom with containerRef (pan clamping)', () => {
  it('clamps touch pan to rendered image bounds', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    // Zoom in (scale 2.5), default 5:3 aspect in 400x300 container
    // renderedW = min(400, 300*5/3) = min(400, 500) = 400
    // renderedH = min(300, 400/5*3) = min(300, 240) = 240
    // maxX = (400*2.5 - 400)/2 = 300
    // maxY = max(0, (240*2.5 - 300)/2) = max(0, 150) = 150
    act(() => result.current.zoomIn());
    expect(result.current.isZoomed).toBe(true);

    act(() => result.current.handlers.onTouchStart(makeTouchEvent([{ clientX: 100, clientY: 100 }])));
    act(() => result.current.handlers.onTouchMove(makeTouchEvent([{ clientX: 600, clientY: 500 }])));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    expect(tx).toBeLessThanOrEqual(300);
    expect(ty).toBeLessThanOrEqual(150);
  });

  it('clamps mouse drag to rendered image bounds', () => {
    const containerRef = makeContainerRef(400, 300);
    const { result } = renderHook(() => useImageZoom({ containerRef }));

    act(() => result.current.zoomIn());
    act(() => result.current.handlers.onMouseDown(makeMouseEvent(100, 100)));
    act(() => result.current.handlers.onMouseMove(makeMouseEvent(700, 600)));

    const transform = result.current.style.transform as string;
    const match = transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/);
    if (!match) throw new Error(`Expected translate in transform: ${transform}`);
    const tx = Number(match[1]);
    const ty = Number(match[2]);
    expect(tx).toBeLessThanOrEqual(300);
    expect(ty).toBeLessThanOrEqual(150);
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
