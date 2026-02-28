import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useHotkeys } from '../hooks/useHotkeys';

function pressKey(key: string, target?: Partial<HTMLElement>) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  if (target) {
    Object.defineProperty(event, 'target', { value: target });
  }
  document.dispatchEvent(event);
}

describe('useHotkeys', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires handler on single key press', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys({ f: handler }));
    pressKey('f');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('ignores keypresses in input elements', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys({ f: handler }));
    pressKey('f', { tagName: 'INPUT' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('ignores keypresses in textarea', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys({ f: handler }));
    pressKey('f', { tagName: 'TEXTAREA' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('fires handler for two-key sequence', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    renderHook(() => useHotkeys({ 'g d': handler }));
    pressKey('g');
    pressKey('d');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not fire sequence after timeout', () => {
    vi.useFakeTimers();
    const handler = vi.fn();
    renderHook(() => useHotkeys({ 'g d': handler }));
    pressKey('g');
    vi.advanceTimersByTime(600);
    pressKey('d');
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fire for unregistered keys', () => {
    const handler = vi.fn();
    renderHook(() => useHotkeys({ f: handler }));
    pressKey('x');
    expect(handler).not.toHaveBeenCalled();
  });
});
