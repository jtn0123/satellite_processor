import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameActionMenu from '../components/GoesData/FrameActionMenu';

const defaultProps = {
  onCompare: vi.fn(),
  onTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onShare: vi.fn(),
  onDelete: vi.fn(),
};

describe('FrameActionMenu', () => {
  it('renders trigger button', () => {
    render(<FrameActionMenu {...defaultProps} />);
    expect(screen.getByLabelText('More actions')).toBeInTheDocument();
  });

  it('opens menu on click', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows all secondary actions', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByText('Compare')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
    expect(screen.getByText('Add to Collection')).toBeInTheDocument();
    expect(screen.getByText('Share')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('calls onDelete when Delete clicked', () => {
    const onDelete = vi.fn();
    render(<FrameActionMenu {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  it('calls onTag when Tag clicked', () => {
    const onTag = vi.fn();
    render(<FrameActionMenu {...defaultProps} onTag={onTag} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Tag'));
    expect(onTag).toHaveBeenCalled();
  });

  it('closes menu after action', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Share'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('trigger button has min 44px touch target', () => {
    render(<FrameActionMenu {...defaultProps} />);
    const btn = screen.getByLabelText('More actions');
    expect(btn.className).toContain('min-w-[44px]');
    expect(btn.className).toContain('min-h-[44px]');
  });

  it('menu items have min 44px height', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    const items = screen.getAllByRole('menuitem');
    items.forEach(item => {
      expect(item.className).toContain('min-h-[44px]');
    });
  });
});
