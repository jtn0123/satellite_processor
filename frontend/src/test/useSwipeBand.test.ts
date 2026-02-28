import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSwipeBand } from '../hooks/useSwipeBand';
import type { Product } from '../components/GoesData/types';

const mockProducts: Product = {
  satellites: ['GOES-16'],
  sectors: [{ id: 'CONUS', name: 'CONUS', product: 'ABI-L2-CMIPF' }],
  bands: [
    { id: 'C01', description: 'Blue' },
    { id: 'C02', description: 'Red' },
    { id: 'C03', description: 'Veggie' },
  ],
};

describe('useSwipeBand', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('swipes to next band on left swipe', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(mockProducts, 'C01', setBand));

    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 300, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.handleTouchEnd({
        changedTouches: [{ clientX: 200, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    expect(setBand).toHaveBeenCalledWith('C02');
    expect(result.current.swipeToast).not.toBeNull();
  });

  it('swipes to previous band on right swipe', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(mockProducts, 'C02', setBand));

    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 200, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.handleTouchEnd({
        changedTouches: [{ clientX: 350, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    expect(setBand).toHaveBeenCalledWith('C01');
  });

  it('does not swipe past boundaries', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(mockProducts, 'C01', setBand));

    // Try swiping right from first band
    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 100, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.handleTouchEnd({
        changedTouches: [{ clientX: 250, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    expect(setBand).not.toHaveBeenCalled();
  });

  it('ignores vertical swipes', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(mockProducts, 'C01', setBand));

    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 200, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.handleTouchEnd({
        changedTouches: [{ clientX: 100, clientY: 300 }],
      } as unknown as React.TouchEvent);
    });

    expect(setBand).not.toHaveBeenCalled();
  });

  it('ignores swipe when zoomed', () => {
    const setBand = vi.fn();
    const { result } = renderHook(() => useSwipeBand(mockProducts, 'C01', setBand));

    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 300, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    act(() => {
      result.current.handleTouchEnd(
        { changedTouches: [{ clientX: 200, clientY: 100 }] } as unknown as React.TouchEvent,
        true, // isZoomed
      );
    });

    expect(setBand).not.toHaveBeenCalled();
  });

  it('cleans up toast timer on unmount', () => {
    vi.useFakeTimers();
    const setBand = vi.fn();
    const { result, unmount } = renderHook(() => useSwipeBand(mockProducts, 'C01', setBand));

    // Trigger a swipe to start the toast timer
    act(() => {
      result.current.handleTouchStart({
        touches: [{ clientX: 300, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });
    act(() => {
      result.current.handleTouchEnd({
        changedTouches: [{ clientX: 200, clientY: 100 }],
      } as unknown as React.TouchEvent);
    });

    expect(result.current.swipeToast).not.toBeNull();

    // Unmount should not throw — timer is cleaned up
    unmount();

    // Advancing timers after unmount should not cause errors
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    vi.useRealTimers();
  });
});
