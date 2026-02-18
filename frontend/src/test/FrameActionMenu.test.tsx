import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameActionMenu from '../components/GoesData/FrameActionMenu';

describe('FrameActionMenu', () => {
  const handlers = {
    onCompare: vi.fn(),
    onTag: vi.fn(),
    onAddToCollection: vi.fn(),
    onDelete: vi.fn(),
  };

  it('renders trigger button', () => {
    render(<FrameActionMenu {...handlers} />);
    expect(screen.getByLabelText('More actions')).toBeInTheDocument();
  });

  it('opens menu on click', () => {
    render(<FrameActionMenu {...handlers} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByText('Compare')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
    expect(screen.getByText('Add to Collection')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls handler and closes menu on item click', () => {
    const onTag = vi.fn();
    render(<FrameActionMenu {...handlers} onTag={onTag} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Tag'));
    expect(onTag).toHaveBeenCalled();
    // Menu should close
    expect(screen.queryByText('Tag')).toBeNull();
  });

  it('menu items have min 44px touch targets', () => {
    render(<FrameActionMenu {...handlers} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    const items = screen.getAllByRole('menuitem');
    items.forEach((item) => {
      expect(item.className).toMatch(/min-h-\[44px\]/);
    });
  });
});
