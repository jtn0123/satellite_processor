import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../components/GoesData/BottomSheet';

describe('BottomSheet', () => {
  it('renders nothing when not open', () => {
    const { container } = render(<BottomSheet open={false} onClose={vi.fn()} title="Test">Content</BottomSheet>);
    expect(container.innerHTML).toBe('');
  });

  it('renders title and children when open', () => {
    render(<BottomSheet open={true} onClose={vi.fn()} title="Filters"><p>Filter content</p></BottomSheet>);
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Filter content')).toBeInTheDocument();
  });

  it('has aria-label matching title', () => {
    render(<BottomSheet open={true} onClose={vi.fn()} title="My Sheet">X</BottomSheet>);
    expect(screen.getByLabelText('My Sheet')).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<BottomSheet open={true} onClose={onClose} title="Test">X</BottomSheet>);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<BottomSheet open={true} onClose={onClose} title="Test">X</BottomSheet>);
    // Backdrop is the first child div with bg-black/50
    const backdrop = container.querySelector('[aria-hidden="true"]');
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('sets body overflow hidden when open', () => {
    const { unmount } = render(<BottomSheet open={true} onClose={vi.fn()} title="Test">X</BottomSheet>);
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders drag handle', () => {
    const { container } = render(<BottomSheet open={true} onClose={vi.fn()} title="Test">X</BottomSheet>);
    expect(container.querySelector('.rounded-full')).toBeTruthy();
  });
});
