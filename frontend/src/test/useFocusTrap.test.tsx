import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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

function EmptyComponent({ onClose }: { onClose: () => void }) {
  const ref = useFocusTrap(onClose);
  return <div ref={ref}><p>No focusable elements</p></div>;
}

describe('useFocusTrap', () => {
  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<TestComponent onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose for other keys', () => {
    const onClose = vi.fn();
    render(<TestComponent onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('handles Tab wrapping from last to first', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<TestComponent onClose={onClose} />);
    const third = getByTestId('third');
    third.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Focus trap should wrap
  });

  it('handles Shift+Tab wrapping from first to last', () => {
    const onClose = vi.fn();
    const { getByTestId } = render(<TestComponent onClose={onClose} />);
    const first = getByTestId('first');
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  });

  it('does not crash with no focusable elements', () => {
    const onClose = vi.fn();
    expect(() => render(<EmptyComponent onClose={onClose} />)).not.toThrow();
  });

  it('cleans up event listeners on unmount', () => {
    const onClose = vi.fn();
    const { unmount } = render(<TestComponent onClose={onClose} />);
    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });
});
