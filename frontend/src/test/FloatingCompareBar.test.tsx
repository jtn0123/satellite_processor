import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingCompareBar from '../components/GoesData/FloatingCompareBar';
import type { GoesFrame } from '../components/GoesData/types';

const makeFrame = (id: string): GoesFrame => ({
  id,
  satellite: 'GOES-16',
  band: 'C02',
  sector: 'CONUS',
  capture_time: '2026-01-01T00:00:00Z',
  file_path: '/test.nc',
  thumbnail_path: null, image_url: '/api/goes/frames/test-id/image', thumbnail_url: '/api/goes/frames/test-id/thumbnail',
  file_size: 1024,
  width: 100,
  height: 100,
  tags: [],
  collections: [],
});

describe('FloatingCompareBar', () => {
  it('renders nothing when no frames selected', () => {
    const { container } = render(
      <FloatingCompareBar selectedFrames={[]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('shows selection count', () => {
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a')]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('shows Compare button when exactly 2 frames selected', () => {
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a'), makeFrame('b')]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByLabelText('Compare selected frames')).toBeInTheDocument();
  });

  it('does not show Compare button with 1 frame', () => {
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a')]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.queryByLabelText('Compare selected frames')).not.toBeInTheDocument();
  });

  it('shows Animate button when 2+ frames selected', () => {
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a'), makeFrame('b')]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByLabelText('Animate selected frames')).toBeInTheDocument();
  });

  it('does not show Animate button with 1 frame', () => {
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a')]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.queryByLabelText('Animate selected frames')).not.toBeInTheDocument();
  });

  it('calls onCompare when Compare clicked', () => {
    const onCompare = vi.fn();
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a'), makeFrame('b')]} onCompare={onCompare} onAnimate={vi.fn()} onClear={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Compare selected frames'));
    expect(onCompare).toHaveBeenCalled();
  });

  it('calls onClear when clear clicked', () => {
    const onClear = vi.fn();
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a')]} onCompare={vi.fn()} onAnimate={vi.fn()} onClear={onClear} />
    );
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onClear).toHaveBeenCalled();
  });

  it('calls onAnimate when Animate clicked', () => {
    const onAnimate = vi.fn();
    render(
      <FloatingCompareBar selectedFrames={[makeFrame('a'), makeFrame('b'), makeFrame('c')]} onCompare={vi.fn()} onAnimate={onAnimate} onClear={vi.fn()} />
    );
    fireEvent.click(screen.getByLabelText('Animate selected frames'));
    expect(onAnimate).toHaveBeenCalled();
  });
});
