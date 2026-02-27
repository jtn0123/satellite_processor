import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDoubleTap } from './useDoubleTap';

describe('useDoubleTap', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('fires onSingleTap after delay when tapped once', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 300));

    act(() => { result.current(); });
    expect(onSingle).not.toHaveBeenCalled();
    expect(onDouble).not.toHaveBeenCalled();

    act(() => { vi.advanceTimersByTime(300); });
    expect(onSingle).toHaveBeenCalledOnce();
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('fires onDoubleTap immediately on second tap within delay', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 300));

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(100); });
    act(() => { result.current(); });

    expect(onDouble).toHaveBeenCalledOnce();
    expect(onSingle).not.toHaveBeenCalled();

    // Even after waiting, single tap should not fire
    act(() => { vi.advanceTimersByTime(500); });
    expect(onSingle).not.toHaveBeenCalled();
  });

  it('treats taps outside delay as separate single taps', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 300));

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onSingle).toHaveBeenCalledOnce();

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(400); });
    expect(onSingle).toHaveBeenCalledTimes(2);
    expect(onDouble).not.toHaveBeenCalled();
  });

  it('uses custom delay', () => {
    const onSingle = vi.fn();
    const onDouble = vi.fn();
    const { result } = renderHook(() => useDoubleTap(onSingle, onDouble, 500));

    act(() => { result.current(); });
    act(() => { vi.advanceTimersByTime(400); });
    act(() => { result.current(); });

    expect(onDouble).toHaveBeenCalledOnce();
  });
});
