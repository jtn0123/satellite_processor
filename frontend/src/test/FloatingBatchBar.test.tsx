import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FloatingBatchBar from '../components/GoesData/FloatingBatchBar';
import type { GoesFrame } from '../components/GoesData/types';

const makeFrame = (id: string): GoesFrame => ({
  id,
  satellite: 'GOES-16',
  band: 'C02',
  sector: 'CONUS',
  capture_time: '2026-01-01T12:00:00Z',
  file_path: '/path',
  file_size: 1024,
  width: null,
  height: null,
  thumbnail_path: null,
  tags: [],
  collections: [],
});

const noop = vi.fn();

describe('FloatingBatchBar', () => {
  it('renders nothing when no frames selected', () => {
    const { container } = render(
      <FloatingBatchBar selectedFrames={[]} onCompare={noop} onAnimate={noop} onTag={noop}
        onAddToCollection={noop} onDelete={noop} onDownload={noop} onClear={noop} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows count and action buttons', () => {
    render(
      <FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]}
        onCompare={noop} onAnimate={noop} onTag={noop}
        onAddToCollection={noop} onDelete={noop} onDownload={noop} onClear={noop} />
    );
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(screen.getByLabelText('Compare selected frames')).toBeInTheDocument();
    expect(screen.getByLabelText('Animate selected frames')).toBeInTheDocument();
    expect(screen.getByLabelText('Tag selected frames')).toBeInTheDocument();
    expect(screen.getByLabelText('Delete selected frames')).toBeInTheDocument();
    expect(screen.getByLabelText('Download selected frames')).toBeInTheDocument();
    expect(screen.getByLabelText('Add selected to collection')).toBeInTheDocument();
  });

  it('calls onClear when X clicked', () => {
    const onClear = vi.fn();
    render(
      <FloatingBatchBar selectedFrames={[makeFrame('1')]}
        onCompare={noop} onAnimate={noop} onTag={noop}
        onAddToCollection={noop} onDelete={noop} onDownload={noop} onClear={onClear} />
    );
    fireEvent.click(screen.getByLabelText('Clear selection'));
    expect(onClear).toHaveBeenCalled();
  });

  it('hides Compare when not exactly 2 selected', () => {
    render(
      <FloatingBatchBar selectedFrames={[makeFrame('1')]}
        onCompare={noop} onAnimate={noop} onTag={noop}
        onAddToCollection={noop} onDelete={noop} onDownload={noop} onClear={noop} />
    );
    expect(screen.queryByLabelText('Compare selected frames')).toBeNull();
  });

  it('all buttons have min 44px touch targets', () => {
    render(
      <FloatingBatchBar selectedFrames={[makeFrame('1'), makeFrame('2')]}
        onCompare={noop} onAnimate={noop} onTag={noop}
        onAddToCollection={noop} onDelete={noop} onDownload={noop} onClear={noop} />
    );
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn.className).toMatch(/min-h-\[44px\]/);
    });
  });
});
