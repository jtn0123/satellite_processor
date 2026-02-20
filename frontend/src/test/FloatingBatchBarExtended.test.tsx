import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingBatchBar from '../components/GoesData/FloatingBatchBar';
import type { GoesFrame } from '../components/GoesData/types';

function makeFrame(id: string): GoesFrame {
  return {
    id,
    satellite: 'GOES-19',
    sector: 'FullDisk',
    band: 'C02',
    capture_time: '2025-01-01T00:00:00Z',
    file_path: `/data/${id}.nc`,
    file_size: 1024,
    width: 1000,
    height: 1000,
    thumbnail_path: null, image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
    tags: [],
    collections: [],
  };
}

const handlers = {
  onCompare: vi.fn(),
  onAnimate: vi.fn(),
  onTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onDelete: vi.fn(),
  onDownload: vi.fn(),
  onClear: vi.fn(),
};

describe('FloatingBatchBar — extended', () => {
  it('returns null when no frames selected', () => {
    const { container } = render(<FloatingBatchBar selectedFrames={[]} {...handlers} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows selected count', () => {
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...handlers} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows Compare button only when exactly 2 frames selected', () => {
    const { rerender } = render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...handlers} />);
    expect(screen.queryByLabelText('Compare selected frames')).not.toBeInTheDocument();

    rerender(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} />);
    expect(screen.getByLabelText('Compare selected frames')).toBeInTheDocument();

    rerender(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2'), makeFrame('3')]} {...handlers} />);
    expect(screen.queryByLabelText('Compare selected frames')).not.toBeInTheDocument();
  });

  it('shows Animate button when 2+ frames selected', () => {
    const { rerender } = render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...handlers} />);
    expect(screen.queryByLabelText('Animate selected frames')).not.toBeInTheDocument();

    rerender(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} />);
    expect(screen.getByLabelText('Animate selected frames')).toBeInTheDocument();
  });

  it('calls onCompare when Compare clicked', () => {
    const onCompare = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} onCompare={onCompare} />);
    fireEvent.click(screen.getByLabelText('Compare selected frames'));
    expect(onCompare).toHaveBeenCalledOnce();
  });

  it('calls onAnimate when Animate clicked', () => {
    const onAnimate = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} onAnimate={onAnimate} />);
    fireEvent.click(screen.getByLabelText('Animate selected frames'));
    expect(onAnimate).toHaveBeenCalledOnce();
  });

  it('calls onTag, onDownload, onAddToCollection, onDelete, onClear', () => {
    const h = {
      onCompare: vi.fn(),
      onAnimate: vi.fn(),
      onTag: vi.fn(),
      onAddToCollection: vi.fn(),
      onDelete: vi.fn(),
      onDownload: vi.fn(),
      onClear: vi.fn(),
    };
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...h} />);

    fireEvent.click(screen.getByLabelText('Tag selected frames'));
    expect(h.onTag).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Download selected frames'));
    expect(h.onDownload).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Add selected to collection'));
    expect(h.onAddToCollection).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Delete selected frames'));
    expect(h.onDelete).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(h.onClear).toHaveBeenCalledOnce();
  });

  it('shows correct count for multiple frames', () => {
    render(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2'), makeFrame('3')]} {...handlers} />);
    expect(screen.getByText('3 selected')).toBeInTheDocument();
  });
});
