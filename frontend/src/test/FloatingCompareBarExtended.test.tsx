import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingCompareBar from '../components/GoesData/FloatingCompareBar';
import type { GoesFrame } from '../components/GoesData/types';

function makeFrame(id: string): GoesFrame {
  return {
    id, satellite: 'GOES-19', sector: 'FullDisk', band: 'C02',
    capture_time: '2025-01-01T00:00:00Z', file_path: `/data/${id}.nc`,
    file_size: 1024, width: 1000, height: 1000, thumbnail_path: null,
    tags: [], collections: [],
  };
}

const handlers = { onCompare: vi.fn(), onAnimate: vi.fn(), onClear: vi.fn() };

describe('FloatingCompareBar — extended', () => {
  it('returns null for empty selection', () => {
    const { container } = render(<FloatingCompareBar selectedFrames={[]} {...handlers} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows count for 1 selected', () => {
    render(<FloatingCompareBar selectedFrames={[makeFrame('1')]} {...handlers} />);
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('hides Compare for 1 frame', () => {
    render(<FloatingCompareBar selectedFrames={[makeFrame('1')]} {...handlers} />);
    expect(screen.queryByLabelText('Compare selected frames')).not.toBeInTheDocument();
  });

  it('shows Compare for exactly 2 frames', () => {
    render(<FloatingCompareBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} />);
    expect(screen.getByLabelText('Compare selected frames')).toBeInTheDocument();
  });

  it('hides Compare for 3+ frames', () => {
    render(<FloatingCompareBar selectedFrames={[makeFrame('1'), makeFrame('2'), makeFrame('3')]} {...handlers} />);
    expect(screen.queryByLabelText('Compare selected frames')).not.toBeInTheDocument();
  });

  it('shows Animate for 2+ frames', () => {
    render(<FloatingCompareBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} />);
    expect(screen.getByLabelText('Animate selected frames')).toBeInTheDocument();
  });

  it('hides Animate for 1 frame', () => {
    render(<FloatingCompareBar selectedFrames={[makeFrame('1')]} {...handlers} />);
    expect(screen.queryByLabelText('Animate selected frames')).not.toBeInTheDocument();
  });

  it('calls onClear', () => {
    const onClear = vi.fn();
    render(<FloatingCompareBar selectedFrames={[makeFrame('1')]} {...handlers} onClear={onClear} />);
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('calls onCompare', () => {
    const onCompare = vi.fn();
    render(<FloatingCompareBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} onCompare={onCompare} />);
    fireEvent.click(screen.getByLabelText('Compare selected frames'));
    expect(onCompare).toHaveBeenCalledOnce();
  });

  it('calls onAnimate', () => {
    const onAnimate = vi.fn();
    render(<FloatingCompareBar selectedFrames={[makeFrame('1'), makeFrame('2')]} {...handlers} onAnimate={onAnimate} />);
    fireEvent.click(screen.getByLabelText('Animate selected frames'));
    expect(onAnimate).toHaveBeenCalledOnce();
  });
});
