import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useSwipeTabs } from '../hooks/useSwipeTabs';

describe('useSwipeTabs', () => {
  it('returns a ref object', () => {
    const { result } = renderHook(() =>
      useSwipeTabs({
        tabs: ['a', 'b', 'c'],
        activeTab: 'b',
        onSwipe: vi.fn(),
      })
    );
    expect(result.current).toHaveProperty('current');
  });

  it('does not call onSwipe without touch events', () => {
    const onSwipe = vi.fn();
    renderHook(() =>
      useSwipeTabs({
        tabs: ['a', 'b', 'c'],
        activeTab: 'b',
        onSwipe,
      })
    );
    expect(onSwipe).not.toHaveBeenCalled();
  });
});
