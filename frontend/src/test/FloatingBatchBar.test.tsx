import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingBatchBar from '../components/GoesData/FloatingBatchBar';
import type { GoesFrame } from '../components/GoesData/types';

const makeFrame = (id: string): GoesFrame => ({
  id,
  satellite: 'GOES-19',
  band: 'C02',
  sector: 'CONUS',
  capture_time: '2026-01-01T00:00:00Z',
  file_path: `/path/${id}`,
  thumbnail_path: `/thumb/${id}`,
  file_size: 1000,
  width: 1920,
  height: 1080,
  tags: [],
  collections: [],
} as GoesFrame);

const defaultHandlers = {
  onCompare: vi.fn(),
  onAnimate: vi.fn(),
  onTag: vi.fn(),
  onAddToCollection: vi.fn(),
  onDelete: vi.fn(),
  onDownload: vi.fn(),
  onClear: vi.fn(),
};

describe('FloatingBatchBar', () => {
  it('renders nothing when no frames selected', () => {
    const { container } = render(<FloatingBatchBar selectedFrames={[]} {...defaultHandlers} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows count of selected frames', () => {
    render(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...defaultHandlers} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
  });

  it('shows Compare button only when exactly 2 frames selected', () => {
    const { rerender } = render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} />);
    expect(screen.queryByLabelText('Compare selected frames')).not.toBeInTheDocument();

    rerender(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...defaultHandlers} />);
    expect(screen.getByLabelText('Compare selected frames')).toBeInTheDocument();
  });

  it('shows Animate button when >= 2 frames selected', () => {
    const { rerender } = render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} />);
    expect(screen.queryByLabelText('Animate selected frames')).not.toBeInTheDocument();

    rerender(<FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...defaultHandlers} />);
    expect(screen.getByLabelText('Animate selected frames')).toBeInTheDocument();
  });

  it('calls onDelete when delete clicked', () => {
    const onDelete = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete selected frames'));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('calls onClear when clear clicked', () => {
    const onClear = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} onClear={onClear} />);
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('calls onDownload when download clicked', () => {
    const onDownload = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} onDownload={onDownload} />);
    fireEvent.click(screen.getByLabelText('Download selected frames'));
    expect(onDownload).toHaveBeenCalledOnce();
  });

  it('calls onTag when tag clicked', () => {
    const onTag = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} onTag={onTag} />);
    fireEvent.click(screen.getByLabelText('Tag selected frames'));
    expect(onTag).toHaveBeenCalledOnce();
  });

  it('calls onAddToCollection when collection clicked', () => {
    const onAdd = vi.fn();
    render(<FloatingBatchBar selectedFrames={[makeFrame('1')]} {...defaultHandlers} onAddToCollection={onAdd} />);
    fireEvent.click(screen.getByLabelText('Add selected to collection'));
    expect(onAdd).toHaveBeenCalledOnce();
  });
});
