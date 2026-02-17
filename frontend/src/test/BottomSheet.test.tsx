import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BottomSheet from '../components/GoesData/BottomSheet';

describe('BottomSheet', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <BottomSheet open={false} onClose={vi.fn()} title="Test">Content</BottomSheet>
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders title and content when open', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="Filters">
        <p>Filter content</p>
      </BottomSheet>
    );
    expect(screen.getByText('Filters')).toBeInTheDocument();
    expect(screen.getByText('Filter content')).toBeInTheDocument();
  });

  it('renders dialog with aria-label', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="Filters">Content</BottomSheet>
    );
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Filters">Content</BottomSheet>
    );
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={true} onClose={onClose} title="Filters">Content</BottomSheet>
    );
    // The backdrop is the first child div with bg-black/50
    const backdrop = document.querySelector('.bg-black\\/50');
    expect(backdrop).toBeTruthy();
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('has drag handle element', () => {
    render(
      <BottomSheet open={true} onClose={vi.fn()} title="Test">Content</BottomSheet>
    );
    // Drag handle is a small rounded div
    const handle = document.querySelector('.w-10.h-1.rounded-full');
    expect(handle).toBeTruthy();
  });
});
