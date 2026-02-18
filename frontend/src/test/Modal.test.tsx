import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../components/GoesData/Modal';

describe('Modal', () => {
  it('renders children and aria-label', () => {
    render(<Modal onClose={vi.fn()} ariaLabel="Test Modal"><p>Hello</p></Modal>);
    expect(screen.getByLabelText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('calls onClose when overlay close button is clicked', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} ariaLabel="Test"><p>X</p></Modal>);
    fireEvent.click(screen.getByLabelText('Close modal'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} ariaLabel="Test"><button>Btn</button></Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose on close-modal custom event', () => {
    const onClose = vi.fn();
    render(<Modal onClose={onClose} ariaLabel="Test"><p>X</p></Modal>);
    globalThis.dispatchEvent(new Event('close-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('renders as open dialog', () => {
    render(<Modal onClose={vi.fn()} ariaLabel="Test"><p>X</p></Modal>);
    const dialog = screen.getByLabelText('Test');
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog).toHaveAttribute('open');
  });

  it('applies custom panelClassName', () => {
    const { container } = render(<Modal onClose={vi.fn()} ariaLabel="Test" panelClassName="custom-panel"><p>X</p></Modal>);
    expect(container.querySelector('.custom-panel')).toBeTruthy();
  });
});
