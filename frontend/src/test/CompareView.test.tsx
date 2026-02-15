import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CompareView from '../components/GoesData/CompareView';

const frameA = { id: 'a', satellite: 'GOES-16', band: 'C02', sector: 'CONUS', capture_time: '2026-01-01T00:00:00Z', file_path: '', thumbnail_path: '', file_size: 0, width: 0, height: 0, tags: [], collections: [] };
const frameB = { ...frameA, id: 'b', satellite: 'GOES-18' };

describe('CompareView', () => {
  it('renders dialog with aria-label', () => {
    const onClose = vi.fn();
    render(<CompareView frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    expect(screen.getByRole('dialog', { name: /compare frames/i })).toBeInTheDocument();
  });

  it('calls onClose when Escape is pressed', () => {
    const onClose = vi.fn();
    render(<CompareView frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    // The useEffect listens on globalThis
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose when Close button clicked', () => {
    const onClose = vi.fn();
    render(<CompareView frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows side-by-side and slider mode buttons', () => {
    const onClose = vi.fn();
    render(<CompareView frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    expect(screen.getByText('Side by Side')).toBeInTheDocument();
    expect(screen.getByText('Slider')).toBeInTheDocument();
  });

  it('switches to slider mode', () => {
    const onClose = vi.fn();
    render(<CompareView frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    fireEvent.click(screen.getByText('Slider'));
    // In slider mode, a cursor-col-resize container should appear
    expect(document.querySelector('.cursor-col-resize')).toBeTruthy();
  });

  it('displays frame metadata', () => {
    const onClose = vi.fn();
    render(<CompareView frameA={frameA as never} frameB={frameB as never} onClose={onClose} />);
    expect(screen.getByText(/GOES-16/)).toBeInTheDocument();
    expect(screen.getByText(/GOES-18/)).toBeInTheDocument();
  });
});
