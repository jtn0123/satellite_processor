import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Modal from '../components/GoesData/Modal';

describe('Modal', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    onClose.mockClear();
  });

  it('renders an open dialog', () => {
    render(<Modal onClose={onClose} ariaLabel="Test Modal"><p>Hello</p></Modal>);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('renders children', () => {
    render(<Modal onClose={onClose} ariaLabel="Test Modal"><p>Child content</p></Modal>);
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('sets aria-label on the panel', () => {
    render(<Modal onClose={onClose} ariaLabel="My Aria Label"><p>Hi</p></Modal>);
    expect(screen.getByLabelText('My Aria Label')).toBeInTheDocument();
  });

  it('calls onClose when backdrop button is clicked', () => {
    render(<Modal onClose={onClose} ariaLabel="Test"><p>Content</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape key via focus trap', async () => {
    render(<Modal onClose={onClose} ariaLabel="Test"><button>Btn</button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on close-modal custom event', () => {
    render(<Modal onClose={onClose} ariaLabel="Test"><p>Hi</p></Modal>);
    act(() => {
      globalThis.dispatchEvent(new Event('close-modal'));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('cleans up close-modal listener on unmount', () => {
    const { unmount } = render(<Modal onClose={onClose} ariaLabel="Test"><p>Hi</p></Modal>);
    unmount();
    act(() => {
      globalThis.dispatchEvent(new Event('close-modal'));
    });
    // onClose should NOT be called after unmount
    expect(onClose).not.toHaveBeenCalled();
  });

  it('applies custom panelClassName', () => {
    render(<Modal onClose={onClose} ariaLabel="Test" panelClassName="custom-panel"><p>Hi</p></Modal>);
    expect(screen.getByLabelText('Test').className).toBe('custom-panel');
  });

  it('applies custom overlayClassName', () => {
    render(<Modal onClose={onClose} ariaLabel="Test" overlayClassName="custom-overlay"><p>Hi</p></Modal>);
    expect(screen.getByRole('dialog').className).toBe('custom-overlay');
  });

  it('uses default panelClassName when not provided', () => {
    render(<Modal onClose={onClose} ariaLabel="Test"><p>Hi</p></Modal>);
    expect(screen.getByLabelText('Test').className).toContain('modal-panel');
  });

  it('uses default overlayClassName when not provided', () => {
    render(<Modal onClose={onClose} ariaLabel="Test"><p>Hi</p></Modal>);
    expect(screen.getByRole('dialog').className).toContain('modal-overlay');
  });

  it('has aria-hidden false on panel', () => {
    render(<Modal onClose={onClose} ariaLabel="Test"><p>Hi</p></Modal>);
    expect(screen.getByLabelText('Test')).toHaveAttribute('aria-hidden', 'false');
  });
});
