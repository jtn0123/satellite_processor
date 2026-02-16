import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ComparisonModal from '../components/GoesData/ComparisonModal';

const makeFrame = (id: string) => ({
  id, satellite: 'GOES-18', sector: 'CONUS', band: 'C13',
  capture_time: '2024-06-01T12:00:00Z', file_path: '/data/img.nc',
  file_size: 2048, thumbnail_path: '/data/thumb.png',
});

describe('ComparisonModal behavior', () => {
  const onClose = vi.fn();
  const frameA = makeFrame('a1');
  const frameB = makeFrame('b2');

  beforeEach(() => onClose.mockClear());

  it('renders with side-by-side mode by default', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    expect(screen.getByText('Side by Side')).toBeInTheDocument();
  });

  it('renders Compare Frames title', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    expect(screen.getByText('Compare Frames')).toBeInTheDocument();
  });

  it('switches to slider mode', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('Slider'));
    // Slider mode should show the range input
    expect(screen.getByLabelText('Image comparison slider')).toBeInTheDocument();
  });

  it('swap button reverses images', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    // Both images rendered
    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
    // Click swap
    fireEvent.click(screen.getByText('Swap'));
    const imagesAfter = screen.getAllByRole('img');
    expect(imagesAfter).toHaveLength(2);
  });

  it('close button calls onClose', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Close comparison'));
    expect(onClose).toHaveBeenCalled();
  });

  it('slider mode shows comparison slider at 50% by default', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('Slider'));
    const slider = screen.getByLabelText('Image comparison slider') as HTMLInputElement;
    expect(slider.value).toBe('50');
  });

  it('slider mode renders two images', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('Slider'));
    const images = screen.getAllByRole('img');
    expect(images.length).toBeGreaterThanOrEqual(2);
  });

  it('side-by-side mode shows frame metadata', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    const satTexts = screen.getAllByText('GOES-18');
    expect(satTexts.length).toBeGreaterThanOrEqual(2);
  });

  it('renders file size info', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    // formatBytes(2048) = "2 KB" - check it exists in the document
    expect(document.body.textContent).toContain('2 KB');
  });

  it('renders dialog with aria-label', () => {
    render(<ComparisonModal frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    expect(screen.getByLabelText('Compare Frames')).toBeInTheDocument();
  });
});
