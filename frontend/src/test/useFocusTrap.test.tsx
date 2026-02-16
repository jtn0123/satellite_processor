import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { useFocusTrap } from '../hooks/useFocusTrap';

function TestComponent({ onClose }: { onClose: () => void }) {
  const ref = useFocusTrap(onClose);
  return (
    <div ref={ref}>
      <button data-testid="first">First</button>
      <button data-testid="second">Second</button>
      <button data-testid="third">Third</button>
    </div>
  );
}

describe('useFocusTrap', () => {
  it('focuses first focusable element on mount', async () => {
    const onClose = vi.fn();
    render(<TestComponent onClose={onClose} />);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first');
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<TestComponent onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('wraps focus forward from last to first on Tab', async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<TestComponent onClose={onClose} />);
    const third = getByTestId('third');
    third.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Focus should wrap to first
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(document.activeElement?.getAttribute('data-testid')).toBe('first');
  });

  it('wraps focus backward from first to last on Shift+Tab', async () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<TestComponent onClose={onClose} />);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    const first = getByTestId('first');
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(document.activeElement?.getAttribute('data-testid')).toBe('third');
  });

  it('restores focus on unmount', async () => {
    const outer = document.createElement('button');
    document.body.appendChild(outer);
    outer.focus();

    const onClose = vi.fn();
    const { unmount } = render(<TestComponent onClose={onClose} />);
    await act(() => new Promise((r) => setTimeout(r, 10)));
    unmount();
    expect(document.activeElement).toBe(outer);
    document.body.removeChild(outer);
  });
});
