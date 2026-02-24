import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDoubleTap } from '../hooks/useDoubleTap';

describe('useDoubleTap', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires single tap after delay', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 300));

    act(() => { result.current(); });
    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(350); });
    expect(onSingle).toHaveBeenCalledTimes(1);
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('fires double tap on rapid second tap', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 300));

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(150); });
    act(() => { result.current(); });

    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(onSingle).not.toHaveBeenCalled();

    // Ensure single tap doesn't fire later
    act(() => { vi.advanceTimersByTime(500); });
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('treats slow second tap as new single tap', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 300));

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(350); });
    expect(onSingle).toHaveBeenCalledTimes(1);

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(350); });
    expect(onSingle).toHaveBeenCalledTimes(2);
    expect(onDouble).not.toHaveBeenCalled();
  });
});
