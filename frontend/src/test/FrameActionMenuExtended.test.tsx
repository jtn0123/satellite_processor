import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FrameActionMenu from '../components/GoesData/FrameActionMenu';

const defaults = {
  onCompare: vi.fn(),
  onTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onDelete: vi.fn(),
};

describe('FrameActionMenu — extended', () => {
  it('hides Share when onShare not provided', () => {
    render(<FrameActionMenu {...defaults} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.queryByText('Share')).not.toBeInTheDocument();
    expect(screen.getByText('Compare')).toBeInTheDocument();
  });

  it('shows Share when onShare provided', () => {
    render(<FrameActionMenu {...defaults} onShare={vi.fn()} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByText('Share')).toBeInTheDocument();
  });

  it('calls onCompare when Compare clicked', () => {
    const onCompare = vi.fn();
    render(<FrameActionMenu {...defaults} onCompare={onCompare} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Compare'));
    expect(onCompare).toHaveBeenCalledOnce();
  });

  it('calls onAddToCollection', () => {
    const onAdd = vi.fn();
    render(<FrameActionMenu {...defaults} onAddToCollection={onAdd} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    fireEvent.click(screen.getByText('Add to Collection'));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it('closes menu on outside mousedown', () => {
    render(<FrameActionMenu {...defaults} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('toggle button has aria-haspopup and aria-expanded', () => {
    render(<FrameActionMenu {...defaults} />);
    const btn = screen.getByLabelText('More actions');
    expect(btn).toHaveAttribute('aria-haspopup', 'true');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('menu items have role=menuitem', () => {
    render(<FrameActionMenu {...defaults} />);
    fireEvent.click(screen.getByLabelText('More actions'));
    const items = screen.getAllByRole('menuitem');
    expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it('toggles menu open/closed on repeated clicks', () => {
    render(<FrameActionMenu {...defaults} />);
    const btn = screen.getByLabelText('More actions');
    fireEvent.click(btn);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});
