import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useSwipeBand } from '../useSwipeBand';
import type { Product } from '../../components/GoesData/types';

function makeTouchEvent(
  overrides: Partial<React.TouchEvent> & { touchesLength?: number } = {},
): React.TouchEvent {
  const { touchesLength = 1, ...rest } = overrides;
  const touches = Array.from({ length: touchesLength }, () => ({ clientX: 0, clientY: 0 }));
  return {
    touches: touches as unknown as React.TouchList,
    changedTouches: [{ clientX: 0, clientY: 0 }] as unknown as React.TouchList,
    ...rest,
  } as unknown as React.TouchEvent;
}

const products: Product = {
  bands: [
    { id: 'band01', name: 'Band 01' },
    { id: 'band02', name: 'Band 02' },
    { id: 'band03', name: 'Band 03' },
  ],
} as unknown as Product;

describe('useSwipeBand', () => {
  it('triggers swipe on single-finger horizontal gesture', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(products, 'band01', setBand));

    act(() => {
      result.current.handleTouchStart(makeTouchEvent({
        touches: [{ clientX: 200, clientY: 100 }] as unknown as React.TouchList,
        touchesLength: 1,
      }));
    });
    act(() => {
      result.current.handleTouchEnd(makeTouchEvent({
        changedTouches: [{ clientX: 100, clientY: 105 }] as unknown as React.TouchList,
      }));
    });

    expect(setBand).toHaveBeenCalledWith('band02');
  });

  it('blocks swipe when isZoomed is true', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(products, 'band01', setBand));

    act(() => {
      result.current.handleTouchStart(makeTouchEvent({
        touches: [{ clientX: 200, clientY: 100 }] as unknown as React.TouchList,
      }));
    });
    act(() => {
      result.current.handleTouchEnd(makeTouchEvent({
        changedTouches: [{ clientX: 100, clientY: 105 }] as unknown as React.TouchList,
      }), true);
    });

    expect(setBand).not.toHaveBeenCalled();
  });

  it('blocks swipe after pinch gesture (wasPinching)', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(products, 'band01', setBand));

    // Simulate multi-touch start (pinch)
    act(() => {
      result.current.handleTouchStart(makeTouchEvent({
        touches: [
          { clientX: 200, clientY: 100 },
          { clientX: 250, clientY: 100 },
        ] as unknown as React.TouchList,
        touchesLength: 2,
      }));
    });

    // One finger lifts — touchEnd fires with single changedTouch
    act(() => {
      result.current.handleTouchEnd(makeTouchEvent({
        changedTouches: [{ clientX: 100, clientY: 105 }] as unknown as React.TouchList,
      }));
    });

    expect(setBand).not.toHaveBeenCalled();
  });

  it('resets wasPinching on next clean single-finger touchStart', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(products, 'band01', setBand));

    // Pinch
    act(() => {
      result.current.handleTouchStart(makeTouchEvent({
        touches: [
          { clientX: 200, clientY: 100 },
          { clientX: 250, clientY: 100 },
        ] as unknown as React.TouchList,
        touchesLength: 2,
      }));
    });
    act(() => {
      result.current.handleTouchEnd(makeTouchEvent({
        changedTouches: [{ clientX: 100, clientY: 105 }] as unknown as React.TouchList,
      }));
    });
    expect(setBand).not.toHaveBeenCalled();

    // New clean single-finger swipe
    act(() => {
      result.current.handleTouchStart(makeTouchEvent({
        touches: [{ clientX: 200, clientY: 100 }] as unknown as React.TouchList,
        touchesLength: 1,
      }));
    });
    act(() => {
      result.current.handleTouchEnd(makeTouchEvent({
        changedTouches: [{ clientX: 100, clientY: 105 }] as unknown as React.TouchList,
      }));
    });

    expect(setBand).toHaveBeenCalledWith('band02');
  });
});
