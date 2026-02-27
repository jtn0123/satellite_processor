import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageZoom } from './useImageZoom';

describe('useImageZoom', () => {
  it('starts at scale=1 and not zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.style.transform).toContain('scale(1)');
  });

  it('zoomIn sets scale to doubleTapScale', () => {
    const { result } = renderHook(() => useImageZoom({ doubleTapScale: 3 }));
    act(() => { result.current.zoomIn(); });
    expect(result.current.isZoomed).toBe(true);
    expect(result.current.style.transform).toContain('scale(3)');
  });

  it('reset returns to initial state', () => {
    const { result } = renderHook(() => useImageZoom());
    act(() => { result.current.zoomIn(); });
    expect(result.current.isZoomed).toBe(true);
    act(() => { result.current.reset(); });
    expect(result.current.isZoomed).toBe(false);
    expect(result.current.style.transform).toContain('scale(1)');
  });

  it('wheel zoom in increases scale', () => {
    const { result } = renderHook(() => useImageZoom());
    const wheelEvent = {
      deltaY: -100,
      preventDefault: () => {},
    } as unknown as React.WheelEvent;

    act(() => { result.current.handlers.onWheel(wheelEvent); });
    expect(result.current.isZoomed).toBe(true);
  });

  it('wheel zoom out from scale=1 stays at scale=1', () => {
    const { result } = renderHook(() => useImageZoom());
    const wheelEvent = {
      deltaY: 100,
      preventDefault: () => {},
    } as unknown as React.WheelEvent;

    act(() => { result.current.handlers.onWheel(wheelEvent); });
    expect(result.current.isZoomed).toBe(false);
  });

  it('respects maxScale', () => {
    const { result } = renderHook(() => useImageZoom({ maxScale: 2 }));
    // Zoom in multiple times
    const wheelEvent = {
      deltaY: -100,
      preventDefault: () => {},
    } as unknown as React.WheelEvent;

    for (let i = 0; i < 20; i++) {
      act(() => { result.current.handlers.onWheel(wheelEvent); });
    }
    expect(result.current.style.transform).toContain('scale(2)');
  });

  it('style has correct cursor when zoomed', () => {
    const { result } = renderHook(() => useImageZoom());
    expect(result.current.style.cursor).toBe('default');
    act(() => { result.current.zoomIn(); });
    expect(result.current.style.cursor).toBe('grab');
  });

  it('exposes all required handler functions', () => {
    const { result } = renderHook(() => useImageZoom());
    const { handlers } = result.current;
    expect(typeof handlers.onWheel).toBe('function');
    expect(typeof handlers.onTouchStart).toBe('function');
    expect(typeof handlers.onTouchMove).toBe('function');
    expect(typeof handlers.onTouchEnd).toBe('function');
    expect(typeof handlers.onMouseDown).toBe('function');
    expect(typeof handlers.onMouseMove).toBe('function');
    expect(typeof handlers.onMouseUp).toBe('function');
  });
});
