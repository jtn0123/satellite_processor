import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLongPress } from '../hooks/useLongPress';

describe('useLongPress', () => {
  it('returns touch and mouse event handlers', () => {
    const { result } = renderHook(() =>
      useLongPress({ onLongPress: vi.fn() })
    );
    expect(result.current).toHaveProperty('onTouchStart');
    expect(result.current).toHaveProperty('onTouchMove');
    expect(result.current).toHaveProperty('onMouseDown');
    expect(result.current).toHaveProperty('onMouseUp');
    expect(result.current).toHaveProperty('onClick');
  });
});
