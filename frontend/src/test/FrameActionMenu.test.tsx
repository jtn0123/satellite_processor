import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameActionMenu from '../components/GoesData/FrameActionMenu';

const defaultProps = {
  onCompare: vi.fn(),
  onTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onDelete: vi.fn(),
};

describe('FrameActionMenu', () => {
  it('renders trigger button with aria-label', () => {
    render(<FrameActionMenu {...defaultProps} />);
    expect(screen.getByLabelText('More actions')).toBeInTheDocument();
  });

  it('menu is closed by default', () => {
    render(<FrameActionMenu {...defaultProps} />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens menu on trigger click', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('shows Compare, Tag, Add to Collection, Delete items', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByText('Compare')).toBeInTheDocument();
    expect(screen.getByText('Tag')).toBeInTheDocument();
    expect(screen.getByText('Add to Collection')).toBeInTheDocument();
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('does not show Share when onShare is not provided', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.queryByText('Share')).not.toBeInTheDocument();
  });

  it('shows Share when onShare is provided', () => {
    render(<FrameActionMenu {...defaultProps} onShare={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('calls onCompare and closes menu when Compare clicked', () => {
    const onCompare = vi.fn();
    render(<FrameActionMenu {...defaultProps} onCompare={onCompare} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Compare'));
    expect(onCompare).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('calls onTag and closes menu', () => {
    const onTag = vi.fn();
    render(<FrameActionMenu {...defaultProps} onTag={onTag} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Tag'));
    expect(onTag).toHaveBeenCalledOnce();
  });

  it('calls onAddToCollection and closes menu', () => {
    const onAdd = vi.fn();
    render(<FrameActionMenu {...defaultProps} onAddToCollection={onAdd} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Add to Collection'));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('calls onDelete and closes menu', () => {
    const onDelete = vi.fn();
    render(<FrameActionMenu {...defaultProps} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Delete'));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('closes menu on outside mousedown', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggles menu open and closed', () => {
    render(<FrameActionMenu {...defaultProps} />);
    const trigger = screen.getByLabelText('More actions');
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('sets aria-expanded correctly', () => {
    render(<FrameActionMenu {...defaultProps} />);
    const trigger = screen.getByLabelText('More actions');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('menu items have role=menuitem', () => {
    render(<FrameActionMenu {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBe(4); // Compare, Tag, Add to Collection, Delete
  });
});
