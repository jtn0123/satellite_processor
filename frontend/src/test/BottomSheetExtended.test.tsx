import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../components/GoesData/BottomSheet';

describe('BottomSheet', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <BottomSheet open={false} onClose={vi.fn()} title="Filters">
        <div>content</div>
      </BottomSheet>
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders dialog when open', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="Filters">
        <div>filter content</div>
      </BottomSheet>
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByText('filter content')).toBeInTheDocument();
  });

  it('shows title in header', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="My Sheet">
        <div>body</div>
      </BottomSheet>
    );
    expect(screen.getByText('My Sheet')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Test">
        <div>body</div>
      </BottomSheet>
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(
      <BottomSheet open={true} onClose={onClose} title="Test">
        <div>body</div>
      </BottomSheet>
    );
    // Backdrop is the first child div with bg-black/50
    const backdrop = container.querySelector('[aria-hidden="true"]');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sets body overflow hidden when open', () => {
    const { unmount } = render(
      <BottomSheet open={true} onClose={vi.fn()} title="Test">
        <div>body</div>
      </BottomSheet>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders children content', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="Test">
        <button>Action</button>
      </BottomSheet>
    );
    expect(screen.getByText('Action')).toBeInTheDocument();
  });
});
